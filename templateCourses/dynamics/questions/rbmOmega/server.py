import random

import numpy as np
import prairielearn as pl


def generate(data):
    omega = np.array([0, 0, randIntNonZero(-5, 5)])
    rPQ = randIntNonZeroArray(2, -5, 5)
    vP = randIntNonZeroArray(2, -5, 5)

    vQ = vP + np.cross(omega, rPQ)

    offset = vQ - vP

    halfOffset = np.rint(np.array([float(offset[0]) / 2, float(offset[1]) / 2, 0]))

    vP = (vP - halfOffset).astype(int)
    vQ = (vQ - halfOffset).astype(int)

    data["params"]["rPQ_vec"] = cartesianVector(rPQ)
    data["params"]["vP_vec"] = cartesianVector(vP)
    data["params"]["vQ_vec"] = cartesianVector(vQ)
    data["params"]["rPQ"] = pl.to_json(rPQ)
    data["params"]["vP"] = pl.to_json(vP)
    data["params"]["vQ"] = pl.to_json(vQ)
    data["correct_answers"]["omega"] = float(omega[2])

    return data


def randIntNonZero(a, b):
    """a: lower bound of the range of integers
       b: upper bound of the range of integers
    returns a non-zero integer in the range [a,b]
    """

    x = 0
    while x == 0:
        x = random.randint(a, b)

    return x


def vectorInBasis(v, basis1, basis2, basis3):
    """v: numpy array of size (3,)
    basis1: first basis vector
    basis2: second basis vector
    basis3: third basis vector, default ""
    """

    basis_list = [basis1, basis2, basis3]
    s = []
    e = 0
    v = v.tolist()
    for i in range(len(v)):
        if type(v[i]) == float:
            if v[i] == int(v[i]):
                v[i] = int(v[i])
        e = str(v[i])
        if e == "0":
            continue
        if e == "1" and basis_list[i] != "":
            e = ""
        if e == "-1" and basis_list[i] != "":
            e = "-"
        e += basis_list[i]
        if len(s) > 0 and e[0] != "-":
            e = "+" + e
        s.append(e)
    if len(s) == 0:
        s.append("0")
    return "".join(s)


def cartesianVector(v):
    return vectorInBasis(v, "\\hat{\\imath}", "\\hat{\\jmath}", "\\hat{k}")


def randIntNonZeroArray(n, a, b, step=1):

    """n: size of the array
       a: lower bound of the range of integers
       b : upper bound of the range of integers
    returns a non-zero vector whose components are integers in the range [a,b]

    """

    r = np.zeros(n)

    while np.linalg.norm(r) == 0:
        if n == 2:
            r = np.array(
                [random.randrange(a, b, step), random.randrange(a, b, step), 0]
            )
        elif n == 3:
            r = np.array(
                [
                    random.randrange(a, b, step),
                    random.randrange(a, b, step),
                    random.randrange(a, b, step),
                ]
            )

    return r
