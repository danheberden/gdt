var _ = require( 'lodash' );
_.mixin( require( 'underscore.deferred' ) );
var dexec = require( 'deferred-exec' );

// TODO: merge this into deferred-exec
var dfs = require('./deferred-fs.js');

// make this better/abstract out/find a plugin/whatever
var logger = function( type ) {
  return function() {
    if ( type !== 'Extra: ' || logger.verbose ) {
      var args = type ? [].concat.apply( [], [ type, arguments ] ) : arguments;
      console.log.apply( console, args );
    }
  };
};
var log = logger();
log.error = logger( 'Error: ' );
log.warn = logger( 'Warning: ' );
log.extra = logger( 'Extra: ' );

// standard operations
var standard = {
  updateGit: function( branch, gitPath, remote ) {

    // default to origin
    remote = remote || 'origin';

    var gitCmd = 'GIT_WORK_TREE="' + gitPath + '" git --git-dir="' + gitPath + '.git"';

    // return a promise based on the git commands
    var update = dexec( gitCmd + ' fetch ' + remote ).then( function( stdout, stderr ) {
      // switch the working tree to the latest branch we wanted
      return dexec( gitCmd + ' checkout -f ' + remote + '/' + branch )
        .done( function( stdout, stderr ) {
          log( 'Switching to updated content successful');
          log.extra( stdout, stderr );
        })
        .fail( function( error, stdout, stderr ) {
          log.error( 'Switching to updated content failed' );
          log.extra( stderr, stdout );
        });
    }).done( function( stdout, stderr ) {
      log( 'Updated contents from remote git repository' );
      log.extra( stdout, stderr );
    }).fail( function( error, stdout, stderr ) {
      log( 'Updating contents from remote git repository failed' );
      log.extra( stderr, stdout );
    });

    return update;
  },

  sync: function( gitDir, folder ) {
    var folderCheck = dfs.exists( folder ).then( null,
      function() {
        return dfs.mkdir( folder ).done( function() {
            log( 'Created ' + folder );
          })
          .fail( function( error ) {
            log.error( 'Creating ' + folder );
            log.extra( error );
          });
      });

    return folderCheck.then( function() {
      return dexec( 'rsync -r --delete-after --exclude .git --delete-excluded ' + gitDir + ' ' + folder )
        .done( function( stdout ) {
          log( 'Synced changes to ' + folder );
          log.extra( stdout );
        })
        .fail( function( error, stdout, stderr ) {
          log( 'Syncing changes to ' + folder + ' failed' );
          log.extra( stdout, stderr );
        });
    });
  }
};

var Gdt = function( site ){
  var gdt = this;

  this.ready = _.Deferred();

  if ( !site ) {
    log.error( 'Site configuration data is required' );
    gdt.ready.reject();
  }

  // was this a filename?
  if ( typeof site === "string" ) {
    dfs.readFile( site, 'utf8' )
      .done( function( data ) {
        gdt.settings = JSON.parse( data );
        gdt.ready.resolve();
      })
      .fail( function() {
        log.error( 'Site configuration data at ' + site + ' was not found.' );
        gdt.ready.reject();
      });
  }

  if ( typeof site === "object" ) {
    this.settings = site;
    if ( !site.git ) {
      log.error( 'A git source folder is required in your site configuration' );
      gdt.ready.reject();
    }
    gdt.ready.resolve();
  }
};



Gdt.prototype = {
  _deploy: function( branch, live ) {

    var gdt = this;
    var targetDir;
    if ( live ) {
      targetDir = this.settings.live;
    } else {
      targetDir = this.settings.deploy + branch + '/';
    }

    // update the git repo
    var action = standard.updateGit( branch, this.settings.git );

    // attach hooks into actions
    _.each( gdt.settings.hooks, function( hook ) {
      action = action.then( function() {
        return hook.apply( gdt, arguments );
      });
    });

    // finalize process by syncing changes
    return action.then( function() {
      return standard.sync( gdt.settings.git, targetDir );
    });
  },
  live: function( branch ) {
    return this._deploy( branch, true );
  },
  stage: function( branch ) {
    return this._deploy( branch, false );
  }
};

module.exports = function( port ) {
  return module.exports.create( port );
};

module.exports.create = function( port ) {

  // default to 8000
  port = port || 8000;

  // TODO: start gith to react to changes
  // and make a method so that sites can
  // opt in to the gith server

  var ret =  function( options ) {
    return new Gdt( options );
  };

  ret.verbose = function( toggle ) {
    logger.verbose = toggle;
  };

  return ret;
};

// todo - move this to its own folder and allow plugins to attach
// to it
var hooks = {

  // hook into our process
  npm: function() {
    return dexec( 'cd ' + site.git + '; npm install' ).done(function( stdout ) {
        log( 'npm install successful' );
        log.extra( stdout, stderr );
      });
  },

  // run grunt based commands - tasks is a string or array of tasks
  // to follow the gruntCmd. gruntCmd defaults to `grunt` but can be
  // specified for other libs like `bbb`
  grunt: function( tasks, gruntCmd ) {
      if ( tasks === "object" && tasks.length ) {
        tasks = tasks.join( ' ' );
      }

      return dexec( 'cd ' + site.git + '; ' + gruntCmd + ' --no-color ' + tasks )
        .done( function( stdout, stderr ) {
          log( '`' + gruntCmd + ' ' +  tasks + '` operation completed.' );
          log.extra( stdout, stderr );
        })
        .fail( function( error, stdout, stderr ) {
          log( '`' + gruntCmd + ' ' + tasks + '` operation failed :/' );
          log.extra( stdout, stderr );
        });
  }

};

