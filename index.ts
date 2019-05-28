require('dotenv').config()

import {NextFunction} from 'express'
import qs from 'qs'
import lodash from 'lodash'

const express = require('express')
const app = express()
const basicAuth = require('express-basic-auth')
const user = process.env.ADMINUSER
const password = process.env.ADMINPW

const knex = require('knex')({
    client: 'pg',
    connection: {
        host : process.env.DBHOST,
        user : process.env.DBUSER,
        password : process.env.DBPW,
        database : process.env.DB
    }
})

app.use( (req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*")
    res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept, Authorization"
    )
    if (req.method === 'OPTIONS') {
        res.header('Access-Control-Allow-Methods', 'PUT, POST, PATCH, DELETE, GET')
        return res.status(200).json({})
    }
    next()
})

app.use(basicAuth({
    users: { [user]: password }
}))

const logRequestStart = (req: Request, res: Response, next: NextFunction) => {
    console.info(`${req.method} ${req.url}`)
    next()
}

app.use(logRequestStart)

app.get('/',  (req, res) => res.send('yao api'))

app.get('/doctors', (req, res) => {
    knex.select().from('doctorprofile')
        .innerJoin('doctorspeciality', 'doctorprofile.iddoctorprofile' ,'doctorspeciality.iddoctorprofile')
        .innerJoin('speciality', 'doctorspeciality.idspeciality', 'speciality.idspeciality')
        .then( data => {
            return res.send(mergeDocs(data))
        })
})

app.get('/symptoms', (req, res) => {
    knex.select().from('symptoms').then(data => res.send(data))
})

app.get('/specialities', (req, res) => {
    knex.select().from('speciality').then( data => res.send(data))
})

app.get('/doctors/description/:iddoctorprofile', (req, res) => {
    knex.select().from('description').where('iddoctorprofile', req.params.iddoctorprofile).then( data => res.send(data))
})

app.get('/doctors/specialities', (req, res) => {
    const queries = []
    const therapies = qs.parse(req.query)

    for(const therapie of therapies.Therapy) {
        queries.push(knex.select().from('doctorprofile')
            .innerJoin('doctorspeciality', 'doctorprofile.iddoctorprofile' ,'doctorspeciality.iddoctorprofile')
            .innerJoin('speciality', 'doctorspeciality.idspeciality', 'speciality.idspeciality')
            .where('speciality', therapie))
    }
    Promise.all(queries).then(data => {
        res.send(mergeDocs(mergeDocs(data)))
    }).catch(error => {
        console.log(error)
        res.send(error)
    })
})

app.post('/subscription/:email', (req, res) => {
    knex('subscriptions').insert({ email: req.params.email }).then(data => res.send(data), error => res.send(error))
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
    }).catch(error => res.send(error))
})

app.listen(3000, function () {
    console.log('Example app listening on port 3000!')
})

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

