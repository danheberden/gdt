var gdt = require('../lib/gdt.js');
var dexec = require( 'deferred-exec' );
var dfs = require( '../lib/deferred-fs.js' );

/*
  ======== A Handy Little Nodeunit Reference ========
  https://github.com/caolan/nodeunit

  Test methods:
    test.expect(numAssertions)
    test.done()
  Test assertions:
    test.ok(value, [message])
    test.equal(actual, expected, [message])
    test.notEqual(actual, expected, [message])
    test.deepEqual(actual, expected, [message])
    test.notDeepEqual(actual, expected, [message])
    test.strictEqual(actual, expected, [message])
    test.notStrictEqual(actual, expected, [message])
    test.throws(block, [error], [message])
    test.doesNotThrow(block, [error], [message])
    test.ifError(value)
*/

var site = {
  git: 'test/gits/original-copy/',
  deploy: 'test/site/deploy/',
  live: 'test/site/live/'
};

exports['git-magic'] = {
  setUp: function(done) {
    // setup here
    var commands = [ 
      'rm -rf test/gits/original-copy',
      'cp -r test/gits/original test/gits/original-copy',
      'rm -rf test/site/deploy test/site/live',
      'mkdir test/site/deploy test/site/live',
      'git --git-dir="test/gits/original-copy/.git" remote add origin "$(pwd)/test/gits/origin/.git"'
    ];
    dexec( commands.join( '; ' ) )
      .then( function() {
        done();
      }, function() {
        console.log( 'An error occurred setting up the test suite. Make sure the `gits` and `site` folders are present.', arguments );
        process.exit(1);
      });
  },
  tearDown: function(done) {
    dexec( 'rm -r test/gits/original-copy; rm -r test/site/live; rm -r test/site/deploy' )
      .then( function() {
        done();
      }, function() {
        console.log( 'An error occurred tearing down the test suite. ', arguments );
        done();
      });
  },
  'update master': function(test) {
    test.expect( 2 );
    // tests here
    var update1 = gdt( 'master', site, { deployLive: true }).then( function(){
      return dfs.readFile( site.live + 'master.txt', 'utf8' );
    });

    var update2 = update1.then( function( err, data ) {
      test.equal( data, 'updated-master\n', 'master.txt should get updated' );
      return dfs.readFile( site.live + 'additional-master.txt', 'utf8' )
    });

    var update3 = update2.then( function( err, data ) {
      test.equal( data, 'additional-master\n', 'additional-master.txt should get copied' );
    }, function(){
      console.log( 'failed', arguments ); 
    }).always( function() {
      test.done();
    });
  },

  'update staging' : function(test) {
    test.expect( 3 );
    var folder = site.deploy + 'stage/';
    var update1 = gdt( 'stage', site, { deployLive: false }).then( function(){
      return dfs.readFile( folder + 'master.txt', 'utf8' );
    });

    var update2 = update1.then( function( err, data ) {
      test.equal( data, 'updated-master\n', 'master.txt should get updated' );
      return dfs.readFile( folder + 'stage.txt', 'utf8' )
    });

    var update3 = update2.then( function( err, data ) {
      test.equal( data, 'staging\n', 'stage.txt should get created' );
      return dfs.readFile( folder + 'additional-master.txt', 'utf8' );
    });

    var update4 = update3.then( function( err, data ) {
      test.equal( data, 'additional-master\n', 'additional-master.txt should get copied' );
    }, function(){
      console.log( 'failed', arguments ); 
    }).always( function() {
      test.done();
    });
  }
};
