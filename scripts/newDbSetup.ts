require('dotenv').config()

const knex = require('knex')({
    client: 'pg',
    connection: {
        host: process.env.PRODDBHOST,
        user: process.env.PRODDBUSER,
        password: process.env.PRODDBPW,
        database: process.env.DB
    }
})


// TODO test if unique stuff works
async function createYaoDB() {
    await knex.schema.createTable('users', table => {
        table.bigIncrements('iduser').notNullable()
        table.string('email').unique().notNullable()
        table.string('password').notNullable()
        table.boolean('admin').notNullable()
        table.boolean('enabled').notNullable()
        table.date('createdat').notNullable()
        //check if we maybe want some other format


    }).catch(error => console.error(error))

    await knex.schema.createTable('doctorprofile', table => {
        table.bigIncrements('iddoctorprofile').notNullable()
        table.bigInteger('iduser').unique().notNullable().references('iduser').inTable('users')
        table.string('firstname').notNullable()
        table.string('lastname').notNullable()
        table.string('title').notNullable()
        table.string('praxisname').notNullable()
        table.string('street').notNullable()
        table.string('housenumber').notNullable()
        table.string('zipcode').notNullable()
        table.string('city').notNullable()
        table.string('state').notNullable()
        table.string('country').notNullable()
        table.string('contactmail').notNullable()
        table.string('phonenumber').notNullable()
        table.string('calendarid').notNullable()
        table.string('pictureurl').notNullable()
        table.string('website').notNullable()
        table.string('facebook').notNullable()
        table.string('instagram').notNullable()
        table.string('twitter').notNullable()
        table.string('youtube').notNullable()
        table.specificType('latlong', 'POINT').notNullable()
    }).catch(error => console.error(error))

    await knex.schema.createTable('description', table => {
                table.bigIncrements('iddescription').notNullable()
                table.bigInteger('iddoctorprofile').references('iddoctorprofile').inTable('doctorprofile').notNullable()
                table.string('header').notNullable()
                table.text('body').notNullable()
            }).catch(error => console.error(error))

    await knex.schema.createTable('speciality', table => {
        table.bigIncrements('idspeciality').notNullable()
        table.string('speciality').unique().notNullable()
    }).catch(error => console.error(error))

    await knex.schema.createTable('doctorspeciality', table => {
        table.bigIncrements('iddoctorspeciality').notNullable()
        table.bigInteger('iddoctorprofile').notNullable().references('iddoctorprofile').inTable('doctorprofile')
        table.bigInteger('idspeciality').notNullable().references('idspeciality').inTable('speciality')
    }).catch(error => console.error(error))

    await knex.schema.createTable('symptoms', table => {
        table.bigIncrements('idsymptoms').notNullable()
        table.string('symptom').unique().notNullable()
    }).catch(error => console.error(error))

    await knex.schema.createTable('symptomsspeciality', table => {
        table.bigIncrements('idsymptomsspeciality').notNullable()
        table.bigInteger('idsymptoms').notNullable().references('idsymptoms').inTable('symptoms')
        table.bigInteger('idspeciality').notNullable().references('idspeciality').inTable('speciality')
        table.unique(['idsymptoms', 'idspeciality'])
    }).catch(error => console.error(error))

    await knex.schema.createTable('subscriptions', table => {
        table.increments('idsubscriptions').notNullable()
        table.string('email').unique().notNullable()
    }).catch(error => console.error(error))
}

createYaoDB()
    .then(res => console.log("setting up the db is finsihed:", res))
    .catch(err => console.error(err))
