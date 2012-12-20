var dexec = require( 'deferred-exec' );

module.exports = function( branch, site, options ) {
  options = options || {};

  // git base command 
  var git = 'GIT_WORK_TREE="' + site.git + '" git --git-dir="' + site.git + '.git"';

  // return a promise based on the git commands
  var updateGit = dexec( git + ' fetch origin' ).then( function( stdout, stderr ) {
    // switch the working tree to the latest branch we wanted
    return dexec( git + ' checkout -f origin/' + branch )
      .done( function( stdout, stderr ) {
        console.log( 'Switching to updated content successful');
      })
      .fail( function( error, stderr, stdout ) {
        console.log( 'Switching to updated content failed', stdout, stderr );
      });
  }).done( function( stdout ) {
    console.log( 'Updated contents from remote git repository', stdout );
  }).fail( function( stdout, stderr ) {
    console.log( 'Updating contents from remote git repository failed' );
  });

  // create something to mess with
  var currentAction = updateGit;

  // hook into our process
  if ( options.npm ) {
    currentAction = actions.then( function( stdout, stderr ) {
      return dexec( 'cd ' + site.git + '; npm install' ).done(function( stdout ) {
          console.log( 'npm install successful.', stdout );
        });
    });
  }

  if ( options.bbb ) {
    currentAction = currentAction.then( function( stdout, stderr ) {
      var tasks = options.bbb.tasks ? options.bbb.tasks.join( ' ' ) : 'release';
      return dexec( 'cd ' + site.git + '; bbb --no-color ' + tasks )
        .done( function( stdout ) {
          console.log( '`bbb ' +  tasks + '` operation completed.', stdout );
        })
        .fail( function( stdout, stderr ) {
          console.log( '`bbb ' + tasks + '` operation failed :/', stdout, stderr );
        });
    });
  }

  // finalize process by syncing changes
  var syncFolder = options.deployLive ? site.live : ( site.deploy + branch );

  var sync = currentAction.then( function( stdout, stderr ) {
    console.log( 'Actions Complete!' );
    var mkdir = '';
    if ( !options.deployLive ) {
      mkdir = 'mkdir ' + syncFolder + '; ';
    }
    return dexec( mkdir + 'rsync -r --delete-after --exclude .git --delete-excluded ' + site.git + ' ' + syncFolder )
      .done( function( stdout ) {
        console.log( 'Synced changes to ' + syncFolder );
      })
      .fail( function( stdout, stderr ) {
        console.log( 'Syncing changes to ' + syncFolder + ' failed', stdout, stderr );
      });
  });

  return sync;
};
