const { MongoClient } = require('mongodb');
const uri = 'mongodb+srv://durveshparadkar23_db_user:Durvesh%40123@cluster0.pospj3k.mongodb.net/situs?retryWrites=true&w=majority';
const client = new MongoClient(uri);

async function fix() {
  await client.connect();
  await client.db('situs').collection('users').updateOne(
    { email: 'durveshparadkar23@gmail.com' },
    { $set: { name: 'Durvesh', role: 'SUPER_ADMIN' } }
  );
  console.log('User fixed!');
  await client.close();
}

fix().catch(console.error);