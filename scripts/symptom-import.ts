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
            .insert({symptom: row.Keywords})
            .catch(async (e) => {
                console.error('symptom already exists:', row.Keywords, 'grab ID now')
                return await knex('symptoms')
                    .returning('idsymptoms')
                    .where('symptom', row.Keywords)
                    .catch(e => console.error(e))
        })

        therapyId = await knex('speciality')
            .returning('idspeciality')
            .insert({speciality: row.Therapy})
            .catch(async (e) => {
                console.error('speciality already exists:', row.Therapy, 'grab ID now')
                return await knex('speciality')
                    .returning('idspeciality')
                    .where('speciality', row.Therapy)
                    .catch(e => console.error(e))
            })

        if(symptomId.length > 0 && therapyId.length > 0) {
            const insertion = {idsymptoms: symptomId[0].idsymptoms || symptomId[0], idspeciality: therapyId[0].idspeciality || therapyId[0]}
            await knex('symptomsspeciality')
                .insert(insertion)
                .catch(e => console.error("Error inserting into symptomsspeciality:", e))
        }
    }
}
