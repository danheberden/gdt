var _ = require( 'lodash' );
_.mixin( require( 'underscore.deferred' ) );
var dexec = require( 'deferred-exec' );
var Gith = require( 'gith' );

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
  updateGit: function( options, gitPath, remote ) {

    // default to origin
    remote = remote || 'origin';

    var gitCmd = 'GIT_WORK_TREE="' + gitPath + '" git --git-dir="' + gitPath + '.git"';

    // return a promise based on the git commands
    var update = dexec( gitCmd + ' fetch ' + remote ).then( function( stdout, stderr ) {
      // switch the working tree to the latest branch/sha/whatever we wanted
      var target = options.sha ? options.sha : ( remote + '/' + options.branch );
      return dexec( gitCmd + ' checkout -f ' + target )
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

var Gdt = function( site, gith ){
  var gdt = this;

  // keep a local ref to gith
  this.gith = gith;

  // used by other methods to see if this gdt is ready to go
  this.ready = _.Deferred();

  // default settings
  var defaults = {
    liveBranch: "master"
  };

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

  // a good ol' object - yay!
  if ( typeof site === "object" ) {
    this.settings = site || {};
    if ( !site.git ) {
      log.error( 'A git source folder is required in your site configuration' );
      gdt.ready.reject();
    }
    gdt.ready.resolve();
  }

  gdt.ready.done( function() {
    gdt.settings = _.extend( {}, defaults, gdt.settings );
  });
};


Gdt.prototype = {
  _deploy: function( branch, live, sha ) {

    var gdt = this;

    // don't do stuff until gdt is ready
    return gdt.ready.then( function() {

      var targetDir;
      if ( live ) {
        targetDir = gdt.settings.live;
      } else {
        targetDir = gdt.settings.deploy + branch + '/';
      }

      var options = {
        branch: branch,
        sha: sha
      };

      // update the git repe
      var action = standard.updateGit( options, gdt.settings.git );

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
    });
  },

  // manual methods for thy pleasure
  live: function( branch, sha ) {
    return this._deploy( branch || this.settings.liveBranch, true, sha );
  },
  stage: function( branch, sha ) {
      var options = {};
    return this._deploy( branch, false, sha );
  },

  // obligator getter and setter
  attr: function( setting, value ) {
    if ( !value ) {
      return this.settings[ setting ];
    } 
    this.settings[ setting ] = value;
    return this;
  },

  // but this is where the gold is
  start: function() {
    var gdt = this;
    // don't bind until we're ready
    var srv = gdt.ready.then( function() {
      var dfd = _.Deferred();
      // only make once
      if ( !gdt.githInstance ) {
        gdt.githInstance = gdt.gith({
          repo: gdt.settings.repo,
        }).on( 'all', gdt._processPayload.bind( gdt ) );
      }
      dfd.resolve( gdt.githInstance );
      return dfd.promise();
    });

    return srv;
  },

  // process the payload gith emitted
  _processPayload: function( payload ) {
    var gdt = this;
    var dfd = _.Deferred();
    var action = dfd.promise();

    // ok to launch live?
    if ( payload.branch === gdt.settings.liveBranch  ) {
      // can we just upload master without worrying about tags?
      if ( !gdt.settings.deployOnTag ) {
        action = action.then( function() {
          return gdt.live( gdt.settings.liveBranch);
        });
      } else if ( payload.tag ) {
        // since we tagged and that's required, only launch at that sha
        action = action.then( function() {
          return gdt.live( gdt.settings.liveBranch, payload.sha );
        });
      }
    }

    // either way, setup the staging version
    action = action.then( function() {
      return gdt.stage( payload.branch );
    });

    // if we assigned a callback, fire it when these are done
    if ( gdt.settings.githCallback ) {
      action.done( function() {
        gdt.settings.githCallback.call( gdt, payload );
      });
    }

    // start us off
    dfd.resolve();
  }

};

module.exports = function( port ) {
  return module.exports.create( port );
};

module.exports.create = function( port ) {

  var ret =  function( options ) {
    return new Gdt( options, ret.gith );
  };

  ret.gith = Gith.create( port || 8000 );

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

