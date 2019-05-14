require('dotenv').config()
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

app.get('/',  (req, res) => res.send('yao api'))

app.get('/doctors', (req, res) => {
    knex.select().from('doctorprofile').then( data => res.send(data))
})

app.get('/specialities', (req, res) => {
    knex.select().from('speciality').then( data => res.send(data))
})

app.get('/doctors/description/:iddoctorprofile', (req, res) => {
    knex.select().from('description').where('iddoctorprofile', req.params.iddoctorprofile).then( data => res.send(data))
})

app.get('/doctors/speciality/:speciality', (req, res) => {
    knex.select().from('doctorprofile')
        .innerJoin('doctorspeciality', 'doctorprofile.iddoctorprofile' ,'doctorspeciality.iddoctorprofile')
        .innerJoin('speciality', 'doctorspeciality.idspeciality', 'speciality.idspeciality')
        .where('speciality', req.params.speciality).then( data => res.send(data))

})

app.post('/subscription/:email', (req, res) => {
    knex('subscriptions').insert({ email: req.params.email }).then(data => res.send(data), error => res.send(error))
})

app.listen(3000, function () {
    console.log('Example app listening on port 3000!')
})
