import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import jose = require('node-jose');
import { z } from 'zod';
import error = require('@prairielearn/error');
import { loadSqlEquiv, queryAsync, queryRows } from '@prairielearn/postgres';
import { flash } from '@prairielearn/flash';

import { getInstitution } from '../../lib/institution';
import { InstitutionAdminLti13 } from './institutionAdminLti13.html';
import { Lti13InstanceSchema } from '../../../lib/db-types';
import { getCanonicalHost } from '../../../lib/url';

const sql = loadSqlEquiv(__filename);
const router = Router({ mergeParams: true });

// Middleware to check for feature and access
router.use(
  asyncHandler(async (req, res, next) => {
    if (!res.locals.lti13_enabled) {
      throw error.make(403, 'Access denied (feature not available)');
    }
    next();
  }),
);

router.get(
  '/:lti13_instance_id?',
  asyncHandler(async (req, res) => {
    const institution = await getInstitution(req.params.institution_id);
    const lti13Instances = await queryRows(
      sql.select_instances,
      {
        institution_id: req.params.institution_id,
      },
      Lti13InstanceSchema,
    );

    const platform_defaults = await queryRows(
      sql.select_defaults,
      {},
      z.object({
        platform: z.string(),
        issuer_params: z.any(),
      }),
    );

    // Handle the / (no id passed case)
    if (typeof req.params.lti13_instance_id === 'undefined' && lti13Instances.length > 0) {
      return res.redirect(`lti13/${lti13Instances[0].id}`);
    }

    const paramInstance = lti13Instances.find(({ id }) => id === req.params.lti13_instance_id);

    res.send(
      InstitutionAdminLti13({
        institution,
        lti13Instances,
        instance: paramInstance ? paramInstance : null,
        resLocals: res.locals,
        platform_defaults,
      }),
    );
  }),
);

router.post(
  '/:lti13_instance_id?',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'add_key') {
      const keystoreJson = await queryAsync(sql.select_keystore, {
        lti13_instance_id: req.params.lti13_instance_id,
        institution_id: req.params.institution_id,
      });
      const keystore = await jose.JWK.asKeyStore(keystoreJson?.rows[0]?.keystore || []);

      const kid = new Date().toUTCString();
      // RSA256 minimum keysize of 2048 bits
      await keystore.generate('RSA', 2048, {
        alg: 'RS256',
        use: 'sig',
        kid: kid,
      });

      await queryAsync(sql.update_keystore, {
        lti13_instance_id: req.params.lti13_instance_id,
        institution_id: req.params.institution_id,
        // true to include private keys
        keystore: keystore.toJSON(true),
      });
      flash('success', `Key ${kid} added.`);
    } else if (req.body.__action === 'delete_keys') {
      await queryAsync(sql.update_keystore, {
        lti13_instance_id: req.params.lti13_instance_id,
        institution_id: req.params.institution_id,
        keystore: null,
      });
      flash('success', `All keys deleted.`);
    } else if (req.body.__action === 'delete_key') {
      const keystoreJson = await queryAsync(sql.select_keystore, {
        lti13_instance_id: req.params.lti13_instance_id,
        institution_id: req.params.institution_id,
      });
      const keystore = await jose.JWK.asKeyStore(keystoreJson?.rows[0]?.keystore || []);

      const key = keystore.get(req.body.kid);

      // Validate the key before removal because keystore.get() returns the first key
      if (req.body.kid === key.kid) {
        keystore.remove(key);

        await queryAsync(sql.update_keystore, {
          lti13_instance_id: req.params.lti13_instance_id,
          institution_id: req.params.institution_id,
          // true to include private keys
          keystore: keystore.toJSON(true),
        });
      } else {
        throw error.make(500, 'error removing key', {
          locals: res.locals,
          body: req.body,
        });
      }
      flash('success', `Key ${key.kid} deleted.`);
    } else if (req.body.__action === 'update_platform') {
      const url = getCanonicalHost(req);

      const client_params = {
        client_id: req.body.client_id || null,
        redirect_uris: [`${url}/pl/lti13_instance/${req.params.lti13_instance_id}/auth/callback`],
        token_endpoint_auth_method: 'private_key_jwt',
        token_endpoint_auth_signing_alg: 'RS256',
      };

      await queryAsync(sql.update_platform, {
        lti13_instance_id: req.params.lti13_instance_id,
        institution_id: req.params.institution_id,
        issuer_params: req.body.issuer_params,
        platform: req.body.platform,
        client_params,
      });
      flash('success', `Platform updated.`);

      // TODO: Saving changes should remove the cached value in auth
    } else if (req.body.__action === 'add_instance') {
      const new_li = await queryRows(
        sql.insert_instance,
        {
          institution_id: req.params.institution_id,
          name_attr: 'name',
          uid_attr: 'email',
          uin_attr: '["https://purl.imsglobal.org/spec/lti/claim/custom"]["uin"]',
        },
        z.string(),
      );
      flash('success', `Instance #${new_li} added.`);

      return res.redirect(`/pl/institution/${req.params.institution_id}/admin/lti13/${new_li}`);
    } else if (req.body.__action === 'update_name') {
      await queryAsync(sql.update_name, {
        name: req.body.name,
        institution_id: req.params.institution_id,
        lti13_instance_id: req.params.lti13_instance_id,
      });
      flash('success', `Name updated.`);
    } else if (req.body.__action === 'save_pl_config') {
      await queryAsync(sql.update_pl_config, {
        name_attribute: req.body.name_attribute,
        uid_attribute: req.body.uid_attribute,
        uin_attribute: req.body.uin_attribute,
        institution_id: req.params.institution_id,
        lti13_instance_id: req.params.lti13_instance_id,
      });
      flash('success', `PrairieLearn config updated.`);
    } else if (req.body.__action === 'remove_instance') {
      await queryAsync(sql.remove_instance, {
        institution_id: req.params.institution_id,
        lti13_instance_id: req.params.lti13_instance_id,
      });
      flash('success', `Instance deleted.`);
    } else {
      throw error.make(400, 'unknown __action', {
        locals: res.locals,
        body: req.body,
      });
    }

    res.redirect(req.originalUrl);
  }),
);

export default router;
