import './node_wrapper';
import * as sdk from '../src';
import assert from 'assert';

require('dotenv').config();

const testResourcesMarkdown = `# test note
![remote url](https://www.wiz.cn/wp-content/new-uploads/1beb5540-5706-11eb-96a4-03130058195d.png)
![](/Users/weishijun/Downloads/apple-icon.png)`;

(async () => {
  try {
    const allUsers = await sdk.getAllUsers()
    console.log(allUsers);
    //
    let user = await sdk.localLogin();
    if (!user) {
      console.log('failed to localLogin, do online login');
      //
      user = await sdk.onlineLogin('as.wiz.cn', process.env.USER_ID!, process.env.PASSWORD!);
      //
      console.log(user);
      //
      assert(user);
      const { userGuid, kbGuid } = user;
      await sdk.syncKb(userGuid, kbGuid);
      //
      const note = await sdk.createNote(userGuid, kbGuid, {
        title: 'test resource note',
        markdown: testResourcesMarkdown,
      });
      console.log(note);
      //
      await sdk.syncKb(userGuid, kbGuid, {
        downloadTrashNotes: true,
        waitDownload: true,
        manual: true,
        callback: ({ error, type, status, note }) => {
          console.log(error, type, status || '', note ? note.title : null);
        }
      });
      //
      console.log('done');
    } else {
      console.log('localLogin done');
      console.log(user);
    }
    //
  } catch (err) {
    console.error(err);
  }

})();
