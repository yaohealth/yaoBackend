require('dotenv').config()
const csv = require('csv-parser')
const fs = require('fs')
const knex = require('knex')({
    client: 'pg',
    connection: {
        host : process.env.DBHOST,
        user : process.env.DBUSER,
        password : process.env.DBPW,
        database : process.env.DB
    }
})

const rows = []

try {
    fs.createReadStream('../test.csv')
        .pipe(csv())
        .on('data', (row) => {
            rows.push(row)
        })
        .on('end', () => {
            console.log('CSV file successfully processed')
            fillDatabase(rows).then(value => console.log('finished inserting', value))
        })
} catch (e) {
    console.error('Parsing failed: ', e)
}

async function fillDatabase(rows) {
    for(const row of rows) {
        let symptomId = []
        let therapyId = []

        symptomId = await knex('symptoms')
            .returning('idsymptoms')
            .insert({symptom: row.Keyword})
            .catch(async (e) => {
                console.error(e)
                symptomId = await knex.select('idsymptoms')
                    .from('symptoms')
                    .where('symptom', row.Keyword)
                    .catch(e => console.error(e))
        })

        therapyId = await knex('speciality')
            .returning('idspeciality')
            .insert({speciality: row.Therapy})
            .catch(async (e) => {
                console.error(e)
                therapyId = await knex.select('idspeciality')
                    .from('speciality')
                    .where('speciality', row.Therapy)
                    .catch(e => console.error(e))
            })


        if(symptomId.length > 0 && therapyId.length > 0) {
            await knex('symptomsspeciality')
                .insert({idsymptoms: symptomId[0], idspeciality: therapyId[0]})
                .catch(e => console.error("Error inserting into symptomsspeciality:", e))
        }
    }
}
