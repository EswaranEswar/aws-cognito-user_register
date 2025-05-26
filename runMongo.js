import { MongoClient } from 'mongodb';

const uri = 'mongodb+srv://eswaran:libraryassets@cluster0.wmd6j.mongodb.net/dashboard?retryWrites=true&w=majority&appName=Cluster0';
const dbName = 'sample';

const client = new MongoClient(uri);

async function deleteDatabase() {
  try {
    await client.connect();
    const db = client.db(dbName);

    // Drop the entire database
    await db.dropDatabase();
    console.log(`Database "${dbName}" deleted successfully.`);
  } catch (error) {
    console.error('Error deleting database:', error.message);
  } finally {
    await client.close();
  }
}

async function deleteCollections(collections) {
  try {
    await client.connect();
    const db = client.db(dbName);

    for (const collection of collections) {
      try {
        const result = await db.collection(collection).drop();
        if (result) {
          console.log(`Collection "${collection}" deleted successfully.`);
        }
      } catch (error) {
        if (error.codeName === 'NamespaceNotFound') {
          console.log(`⚠️ Collection "${collection}" does not exist.`);
        } else {
          console.error(`Error deleting collection "${collection}":`, error.message);
        }
      }
    }
  } finally {
    await client.close();
  }
}

//To delete the entire database
deleteDatabase(); 

//To delete the specified collections
// deleteCollections(['resumes']); 