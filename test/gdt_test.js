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

// get and fire up gdt on port 8000
var gdt = require('../lib/gdt.js').create( 8000 );
var dexec = require( 'deferred-exec' );
var dfs = require( '../lib/deferred-fs.js' );

var site = JSON.parse('{"git":"test/gits/original-copy/","deploy":"test/site/deploy/","live":"test/site/live/"}');

// make a new site
var testSite = gdt( site );

// sanity:
gdt.verbose( false );

exports['gdt update stage and master'] = {
  setUp: function(done) {
    // clean up our testing area
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
    // clean up behind ourselvesj
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
    var update1 = testSite.live( 'master' ).then( function(){
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
    var update1 = testSite.stage( 'stage' ).then( function(){
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
