//
/*
Update sql:
[{
  version: '1.0',
  sql: [
    `create table notes ...`,
    `create table notes ...`,
  ]
}, {
  version: '1.1',
  sql: [
    `alter table add column xxx after yyy`,
  ]
}]
*/

import SqliteDb from "./sqlite_db";

export interface SqlCommand {
  sql: string[],
  version: string,
}

//
async function processSqlCommand(db: SqliteDb, sqlCommand: SqlCommand) {
  //
  for (const sql of sqlCommand.sql) {
    try {
      await db.run(sql);
    } catch (err) {
      if (err.message.indexOf('no such tokenizer: cjk') !== -1) {
        //
        console.log('Your sqlite is not support cjk tokenizer');
        const sql2 = sql.replace(`tokenize='cjk'`, `tokenize='unicode61'`);
        await db.run(sql2);
        //
      } else throw err;
    }
  }
  //
}

//
async function isCommandExecuted(db: SqliteDb, sqlCommand: SqlCommand) {
  try {
    const version = sqlCommand.version;
    const rows = await db.all(`select * from wiz_db_version where version = ?`, [version]);
    if (rows.length === 1) {
      return true;
    }
  } catch (err) {
    if (err.message.indexOf('no such table') === -1) {
      console.error(err.message);
      throw err;
    }
  }
  return false;
}

//
async function setCommandExecuted(db: SqliteDb, sqlCommand: SqlCommand) {
  //
  const version = sqlCommand.version;
  await db.run(`insert into wiz_db_version (version, executed) values (?, ?)`, [version, new Date()]);
}
//
async function doUpgrade(db: SqliteDb, sqlCommands: SqlCommand[]) {
  //
  for (const sqlCommand of sqlCommands) {
    const executed = await isCommandExecuted(db, sqlCommand);
    if (executed) {
      // console.log(`skip ${sqlCommand.version}`);
      continue;
    }
    const version = sqlCommand.version;
    console.log(`executing ${version}`);
    await processSqlCommand(db, sqlCommand);
    //
    await setCommandExecuted(db, sqlCommand);
  }
}

//
async function updateDb(db: SqliteDb, sqlCommands: SqlCommand[]) {
  console.log(`updating... ${db._dbPath}`)
  const ret = await doUpgrade(db, sqlCommands);
  console.log('updating db done...')
  return ret;
}
//
export default updateDb;
