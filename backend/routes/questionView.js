var Promise = require('bluebird');
var models = require('../models');
var config = require('../config');
var _ = require('underscore');

var express = require('express');
var router = express.Router();

router.get('/', function(req, res, next) {
    Promise.try(function() {
        var sql = 'SELECT q.*,top.name as topic_name'
            + ' FROM questions as q'
            + ' JOIN topics as top ON (top.id = q.topic_id)'
            + ' WHERE q.id = :questionId'
            + ';'
        var params = {
            questionId: req.locals.questionId,
        };
        return models.sequelize.query(sql, {replacements: params});
    }).spread(function(results, info) {
        var locals = _.extend({
            result: results[0],
        }, req.locals);
        res.render('questionView', locals);
    });
});

module.exports = router;
