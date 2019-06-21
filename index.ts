require('dotenv').config()

import {NextFunction} from 'express'
import qs from 'qs'
import lodash from 'lodash'
import got from 'got'
import cors from 'cors'
import * as jwt from 'jsonwebtoken'
import * as bcrypt from 'bcrypt'

const express = require('express')
const app = express()
const cookieParser = require('cookie-parser')
const expressjwt = require('express-jwt')

const saltRounds = 10

const knex = require('knex')({
    client: 'pg',
    connection: {
        host: process.env.NODE_ENV==='production' ? process.env.PRODDBHOST : process.env.DEVDBHOST,
        user: process.env.NODE_ENV==='production' ? process.env.PRODDBUSER : process.env.DEVDBUSER,
        password: process.env.NODE_ENV==='production' ? process.env.PRODDBPW : process.env.DEVDBPW,
        database: process.env.DB
    }
})

app.use(cors())
app.options('*', cors())

app.use(logRequestStart)

app.use( require('body-parser').json())
app.use(cookieParser())
app.use(
    expressjwt({
        secret: process.env.JWTPRIVATE
    }).unless({
        path: [
            // use regex if params are expected in that path
            '/auth/user',
            '/auth/login',
            '/doctors',
            '/symptoms',
            '/specialities',
            '/doctors/specialities',
            /^\/doctors\/description\/.*/,
            /^\/subscription\/.*/,
            '/therapies/symptoms',
            '/acuity/appointment-types',
            '/acuity/availability/dates',
            '/acuity/availability/times',
            '/acuity/appointments'
        ]
    })
)

/*
 * Helper Functions
 */

function mergeDocs(docs) {
    docs = lodash.flatten(docs)
    const ids = lodash.uniq(docs.map(doc => doc.iddoctorprofile))
    const result = []
    let tmp

    for(const id of ids) {
        tmp = docs.filter(doc => doc.iddoctorprofile === id)
        if(tmp.length === 1){
            result.push(tmp)
        } else if(tmp.length > 1){
            result.push(lodash.mapValues(tmp[0], (value, key) => {
                if(key === 'speciality' || key === "idspeciality") {
                    return lodash.map(tmp, key)
                } else {
                    return value
                }
            }))
        }
    }
    return lodash.flatten(result)
}

function logRequestStart(req: Request, res: Response, next: NextFunction) {
    console.info(`${req.method} ${req.url}`)
    next()
}

/*
 * YAO API
 */

app.get('/',  (req, res) => res.send('yao api'))

app.get('/doctors', (req, res) => {
    knex.select().from('doctorprofile')
        .innerJoin('doctorspeciality', 'doctorprofile.iddoctorprofile' ,'doctorspeciality.iddoctorprofile')
        .innerJoin('speciality', 'doctorspeciality.idspeciality', 'speciality.idspeciality')
        .then( data => {
            return res.send(mergeDocs(data))
        })
        .catch(err => {
            console.error(err)
            res.status(404).send(err)
        })
})

app.get('/symptoms', (req, res) => {
    knex.select().from('symptoms')
        .then(data => res.send(data))
        .catch(err => {
            console.error(err)
            res.status(404).send(err)
        })
})

app.get('/specialities', (req, res) => {
    knex.select().from('speciality')
        .then( data => res.send(data))
        .catch(err => {
            console.error(err)
            res.status(404).send(err)
        })
})

app.get('/doctors/description/:iddoctorprofile', (req, res) => {
    knex.select().from('description').where('iddoctorprofile', req.params.iddoctorprofile)
        .then( data => res.send(data))
        .catch(err => {
            console.error(err)
            res.status(404).send(err)
        })
})

app.get('/doctors/specialities', (req, res) => {
    const queries = []
    const therapies = qs.parse(req.query)

    for(const therapie of therapies.Therapy) {
        // get all doctors with specified speciality and then return all these doctors with all their specialities
        queries.push(knex.raw(`select * from doctorprofile join doctorspeciality on (doctorprofile.iddoctorprofile = doctorspeciality.iddoctorprofile) join speciality on (doctorspeciality.idspeciality = speciality.idspeciality) 
        where doctorprofile.iddoctorprofile in (select doctorprofile.iddoctorprofile from doctorprofile join doctorspeciality on (doctorprofile.iddoctorprofile = doctorspeciality.iddoctorprofile) join speciality on (doctorspeciality.idspeciality = speciality.idspeciality) 
        where speciality = '${therapie}')`))
    }
    Promise.all(queries).then(data => {
        res.send(mergeDocs(data.map(data => data.rows)))
    }).catch(error => {
        console.log(error)
        res.status(404).send(error)
    })
})

app.post('/subscription/:email', (req, res) => {
    knex('subscriptions').insert({ email: req.params.email })
        .then(data => res.send(data))
        .catch(err => {
            console.error(err)
            res.status(404).send(err)
        })
})

app.get('/therapies/symptoms', (req, res) => {
    let result
    const queries = []
    const symptoms = qs.parse(req.query)

    for(const symptom of symptoms.Symptom) {
        queries.push(knex.select().from('speciality')
            .innerJoin('symptomsspeciality', 'speciality.idspeciality', 'symptomsspeciality.idspeciality')
            .innerJoin('symptoms', 'symptomsspeciality.idsymptoms', 'symptoms.idsymptoms')
            .where('symptom', symptom))
    }
    Promise.all(queries).then(data => {
        result = data.map(symptomArray => {
            return {
                symptom: symptomArray[0].symptom,
                specialities: symptomArray.map(data => data.speciality)
            }
        })
        res.send(result)
    }).catch(err => {
        console.error(err)
        res.status(404).send(err)
    })
})

app.post('/users/register', (req, res) => {
    if(req.body && req.body.email && req.body.password) {
        bcrypt.hash(req.body.password, saltRounds, function(err, hash) {
            if(!err) {
                // TODO catch unique error
                knex('users')
                    .insert({
                        email: req.body.email,
                        password: hash,
                        enabled: true,
                        createdat: new Date().toISOString()
                    })
                    .then(result => res.send(result))
                    .catch(err => res.status(404).send(err))
            } else {
                res.status(404).send(err)
            }
        })
    }
})

app.post('/auth/login', (req, res) => {
    const username = req.body.username
    const password = req.body.password
    if (!username || !password) {
        return res.status(400).json({type: 'error', message: 'username and password fields are essential for authentication.'})
    } else {
        knex.select().from('users').where('email', username)
            .then(user => {
                if(user.length === 1) {
                    bcrypt.compare(password, user[0].password)
                        .then(data => {
                            if(data) {
                                jwt.sign({user: {email: user[0].email, id: user[0].iduser}}, process.env.JWTPRIVATE, {expiresIn: '7h'}, (err, encoded) => {
                                    res.send({
                                        type: 'success',
                                        message: 'User logged in.',
                                        user: {email: user[0].email, id: user[0].iduser},
                                        token: encoded
                                    })
                                })
                            } else {
                                return res.status(403).json({type: 'error', message: 'Wrong email or password'})
                            }
                        }).catch(err => {
                        console.log(err)
                        return res.status(500).json({type: 'error', message: 'bcrypt error', err})
                    })
                } else {
                    res.status(403).json({type: 'error', message: 'Wrong email or password'})
                }
            })
    }
})

app.get('/me', (req, res) => {
    let token = req.headers.authorization
    token = token.split(' ')
    if (!token) {
        return res.status(400).json({type: 'error', message: 'x-access-token header not found.'})
    }
    jwt.verify(token[1], process.env.JWTPRIVATE, (error, result) => {
        if (error) {
            return res.status(403).json({type: 'error', message: 'Provided token is invalid.', error})
        }
        console.log(result)
        return res.json({
            type: 'success',
            message: 'Provided token is valid.',
            result
        })
    })
})

// DANGEROUS just for admins!!!!!!!!!!!!!
// app.get('/users', (req, res) => {
//     knex.select().from('users')
//         .then(data => res.send(data))
// })

app.listen(3000, function () {
    console.log('Example app listening on port 3000!')
})

/*
 * Acuitiy Booking API
 */

app.get('/acuity/appointment-types', (req, res) => {
    got('https://acuityscheduling.com/api/v1/appointment-types', {auth: `${process.env.ACUITYUSER}:${process.env.ACUITYPW}`})
        .then(response => res.send(response.body))
        .catch(err => {
            console.error(err)
            res.status(404).send(err)
        })
})

app.get('/acuity/availability/dates', (req, res) => {
    const parsedQuery = qs.parse(req.query)
    const query = new URLSearchParams(parsedQuery);
    got(`https://acuityscheduling.com/api/v1/availability/dates`, {query, auth: `${process.env.ACUITYUSER}:${process.env.ACUITYPW}`})
        .then(response => res.send(response.body))
        .catch(err => {
            console.error(err)
            res.status(404).send(err)
        })

})

app.get('/acuity/availability/times',  (req, res) => {
    const parsedQuery = qs.parse(req.query)
    const query = new URLSearchParams(parsedQuery);
    got(`https://acuityscheduling.com/api/v1/availability/times`, {query, auth: `${process.env.ACUITYUSER}:${process.env.ACUITYPW}`})
        .then(response => res.send(response.body))
        .catch(err => {
            console.error(err)
            res.status(404).send(err)
        })
})

app.post('/acuity/appointments',(req, res) => {
    got.post(`https://acuityscheduling.com/api/v1/appointments`, { body: JSON.stringify(req.body), auth: `${process.env.ACUITYUSER}:${process.env.ACUITYPW}`})
        .then(response => res.send(response.body))
        .catch(err => {
            console.error(err)
            res.status(404).send(err)
        })
})
