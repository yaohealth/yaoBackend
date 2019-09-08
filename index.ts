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
const { body, check, validationResult } = require('express-validator')

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
            /^\/doctor\/.*/,
            /^\/subscription\/.*/,
            /^\/doctor\/bydocid\/*/,
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
    const query = qs.parse(req.query)
    // TODO this returns no doctor if the join fails due to not existing doctorspecialities. maybe get doctors and afertwards merge the specialities
    knex.select().from('doctorprofile')
        .innerJoin('doctorspeciality', 'doctorprofile.iddoctorprofile' ,'doctorspeciality.iddoctorprofile')
        .innerJoin('speciality', 'doctorspeciality.idspeciality', 'speciality.idspeciality')
        .then( data => {
            const result = mergeDocs(data)
            const reduced = []
            if(typeof query.Limit === 'number') {
                for (let i = 0; i < query.Limit; i++) {
                    reduced.push(result.splice(Math.ceil(Math.random() * 10) % result.length, 1)[0])
                }
                return res.send(reduced)
            } else {
                return res.send(result)
            }
        }).catch(err => {
            console.error(err)
            return res.status(404).send(err)
        })
})

app.get('/doctor/bydocid/:iddoctorprofile', (req, res) => {
    knex.select()
        .from('doctorprofile')
        .innerJoin('doctorspeciality', 'doctorprofile.iddoctorprofile' ,'doctorspeciality.iddoctorprofile')
        .innerJoin('speciality', 'doctorspeciality.idspeciality', 'speciality.idspeciality')
        .where('doctorprofile.iddoctorprofile', req.params.iddoctorprofile)
        .then(data => {
            // data can be empty if the doctor has no specialites selected
            if(data.length === 0) {
                return knex.select()
                    .from('doctorprofile')
                    .where('doctorprofile.iddoctorprofile', req.params.iddoctorprofile)
                    .then( data => {
                        return res.send(mergeDocs(data))
                    })
            } else {
                return res.send(mergeDocs(data))
            }
        })
        .catch(err => {
            console.error(err)
            return res.status(404).send(err)
        })

})

app.get('/doctor/:iduser', (req, res) => {
    knex.select()
        .from('doctorprofile')
        .innerJoin('doctorspeciality', 'doctorprofile.iddoctorprofile' ,'doctorspeciality.iddoctorprofile')
        .innerJoin('speciality', 'doctorspeciality.idspeciality', 'speciality.idspeciality')
        .where('doctorprofile.iduser', req.params.iduser)
        .then(data => {
            // data can be empty if the doctor has no specialites selected
            if(data.length === 0) {
                return knex.select()
                    .from('doctorprofile')
                    .where('doctorprofile.iduser', req.params.iduser)
                    .then( data => {
                        return res.send(mergeDocs(data))
                    })
            } else {
                return res.send(mergeDocs(data))
            }
        })
        .catch(err => {
            console.error(err)
            return res.status(404).send(err)
        })

})

app.get('/symptoms', (req, res) => {
    knex.select().from('symptoms')
        .then(data => res.send(data))
        .catch(err => {
            console.error(err)
            return res.status(404).send(err)
        })
})

app.get('/specialities', (req, res) => {
    knex.select().from('speciality')
        .then( data => res.send(data))
        .catch(err => {
            console.error(err)
            return res.status(404).send(err)
        })
})

app.get('/doctors/description/:iddoctorprofile', (req, res) => {
    knex.select().from('description').where('iddoctorprofile', req.params.iddoctorprofile)
        .then( data => res.send(data))
        .catch(err => {
            console.error(err)
            return res.status(404).send(err)
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
        return res.send(mergeDocs(data.map(data => data.rows)))
    }).catch(error => {
        console.log(error)
        return res.status(404).send(error)
    })
})

app.post('/subscription/:email', (req, res) => {
    knex('subscriptions').insert({ email: req.params.email })
        .then(data => res.send(data))
        .catch(err => {
            console.error(err)
            return res.status(404).send(err)
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
        return res.send(result)
    }).catch(err => {
        console.error(err)
        return res.status(404).send(err)
    })
})

app.post('/doctor/:iduser', async (req, res) => {
    // TODO use express validator to verifiy the input
    const doctor = req.body.doctor[0]
    const iduser = doctor.iduser
    const loggedInUser = req.params.iduser
    const iddoctorprofile = doctor.iddoctorprofile
    // TODO check if this check is sufficent
    if (iduser === loggedInUser) {
        // we want to remove these keys because these dont belong onto the user object or should not be updated
        for(const key of ['iduser', 'speciality', 'iddoctorspeciality', 'idspeciality',  'iddoctorprofile']) {
            delete doctor[key]
        }

        const query = new URLSearchParams([['key', process.env.LOCATIONIQ_APIKEY], ['street', `${doctor.street} ${doctor.housenumber}`], ['city', doctor.city], ['postalcode', doctor.zipcode], ['format', 'json']]);
        const geo = await got(`https://eu1.locationiq.com/v1/search.php?`, {query}).catch(e => console.log(e))
        geo.body = JSON.parse(geo.body)
        console.log(geo.body)
        if (geo.body.length > 0) {
            // need to convert this so that knex can insert a POINT
            doctor.latlong = knex.raw(`POINT(${geo.body[0].lat}, ${geo.body[0].lon})`)
        } else {
            // need to convert this so that knex can insert a POINT
            doctor.latlong = knex.raw(`POINT(${doctor.latlong.x}, ${doctor.latlong.y})`)
            return res.status(403).send({message: 'Could not find address.'})
        }

        knex('doctorprofile').where('iddoctorprofile', iddoctorprofile).update(doctor).then( result => {
            return res.sendStatus(200)
        }).catch(err => res.send(err))
    } else {
        return res.sendStatus(403)
    }

})

app.post('/description/:iduser', async (req, res) => {
    const descriptions = req.body.descriptions
    try {
        for (const description of descriptions) {
            // if it doesnt exits add the new one
            if (description.iddescription === null) {
                await knex('description').insert({
                    iddoctorprofile: description.iddoctorprofile,
                    header: description.header,
                    body: description.body
                })
            } else {
                // udpate the existing descriptions
                await knex('description').where('iddescription', description.iddescription).update({
                    header: description.header,
                    body: description.body
                })
            }
        }
        return res.sendStatus(200)
    } catch (e) {
        return res.send(e)
    }
})

app.post('/description/delete/:iduser', (req, res) => {
    const description = req.body.description
    if(description.iddescription !== null) {
        knex('description').where('iddescription ', description.iddescription).del().then(result => {
            return res.sendStatus(200)
        }).catch(error => res.send(error))
    }
})

app.post('/specialities/:iduser/:iddoctorprofile', async (req, res) => {
    const specialities = req.body.specialities
    const iddoctorprofile = req.params.iddoctorprofile
    const completeSpecialities = []
    for(const speciality of specialities) {
        completeSpecialities.push(await knex('speciality').where('speciality', speciality))
    }
    const doctorspecialies = await knex('doctorspeciality').where('iddoctorprofile', iddoctorprofile)
    for (const doctorspec of doctorspecialies) {
        await knex('doctorspeciality').where('iddoctorspeciality', doctorspec.iddoctorspeciality).del()
    }

    for(const speciality of completeSpecialities) {
        await knex('doctorspeciality').insert({iddoctorprofile, idspeciality: speciality[0].idspeciality})
    }
    return res.sendStatus(200)

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
                return res.status(404).send(err)
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
                    return res.status(403).json({type: 'error', message: 'Wrong email or password'})
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
        return res.json({
            type: 'success',
            message: 'Provided token is valid.',
            user: result.user
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
            return res.status(404).send(err)
        })
})

app.get('/acuity/availability/dates', (req, res) => {
    const parsedQuery = qs.parse(req.query)
    const query = new URLSearchParams(parsedQuery);
    got(`https://acuityscheduling.com/api/v1/availability/dates`, {query, auth: `${process.env.ACUITYUSER}:${process.env.ACUITYPW}`})
        .then(response => res.send(response.body))
        .catch(err => {
            console.error(err)
            return res.status(404).send(err)
        })

})

app.get('/acuity/availability/times',  (req, res) => {
    const parsedQuery = qs.parse(req.query)
    const query = new URLSearchParams(parsedQuery);
    got(`https://acuityscheduling.com/api/v1/availability/times`, {query, auth: `${process.env.ACUITYUSER}:${process.env.ACUITYPW}`})
        .then(response => res.send(response.body))
        .catch(err => {
            console.error(err)
            return res.status(404).send(err)
        })
})

app.post('/acuity/appointments',(req, res) => {
    got.post(`https://acuityscheduling.com/api/v1/appointments`, { body: JSON.stringify(req.body), auth: `${process.env.ACUITYUSER}:${process.env.ACUITYPW}`})
        .then(response => res.send(response.body))
        .catch(err => {
            console.error(err)
            return res.status(404).send(err)
        })
})
