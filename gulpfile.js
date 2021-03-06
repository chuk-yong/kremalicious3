// load plugins
var $ = require('gulp-load-plugins')();

// manually require modules that won"t get picked up by gulp-load-plugins
var gulp            = require('gulp'),
    del             = require('del'),
    pkg             = require('./package.json'),
    parallelize     = require('concurrent-transform'),
    browser         = require('browser-sync'),
    autoprefixer    = require('autoprefixer'),
    cssnano         = require('cssnano');

// Temporary solution until gulp 4
// https://github.com/gulpjs/gulp/issues/355
var runSequence = require('run-sequence');

// handle errors
var onError = function(error) {
    $.util.log('');
    $.util.log($.util.colors.red('You fucked up:', error.message, 'on line' , error.lineNumber));
    $.util.log('');
    this.emit('end');
}

// 'development' is just default, production overrides are triggered
// by adding the production flag to the gulp command e.g. `gulp build --production`
var isProduction = ($.util.env.production === true ? true : false);

// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
// Terminal Banner
// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

console.log("");
console.log($.util.colors.gray("   <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<>>>>>>>>>>>>>>>>>>>>>>>>>>>>"));
console.log("");
console.log($.util.colors.cyan("      (o) Just what do you think you're doing,", process.env.USER, "?    "));
console.log("");
console.log($.util.colors.gray("   <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<>>>>>>>>>>>>>>>>>>>>>>>>>>>>"));
console.log("");

// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
// Config
// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

// Port to use for the development server.
var PORT = 1337;

// Browsers to target when prefixing CSS.
var COMPATIBILITY = ['last 2 versions', 'ie >= 9'];

// paths
var SRC       = '_src',
    DIST      = '_site',
    S3BUCKET  = 'kremalicious.com',
    S3PATH    = '/',
    S3REGION  = 'eu-central-1';

// icons
var ICONS = {
    entypo: {
        src: SRC + '/_assets/icons/entypo/',
        dist: DIST + '/assets/img/',
        prefix: 'entypo-',
        icons: [
            'twitter', 'facebook', 'google+', 'magnifying-glass', 'rss', 'link', 'arrow-with-circle-down', 'forward', 'heart', 'info-with-circle', 'infinity', 'github', 'chevron-right', 'chevron-left', 'eye', 'bitcoin'
        ]
    }
}

var iconset = ICONS.entypo;

// Iterate through the icon set array
iconset.icons.forEach(function(icon, i, icons) {
    icons[i] = iconset.src + icon + '.svg';
});

// SVG sprite
var SPRITE = {
    dest: DIST + '/assets/img/',
    mode: {
        symbol: {
            dest: './',
            sprite: 'sprite.svg'
        }
    }
}

// code banner
var BANNER = [
    '/**',
    ' ** <%= pkg.name %> v<%= pkg.version %>',
    ' ** <%= pkg.description %>',
    ' ** <%= pkg.homepage %>',
    ' **',
    ' ** <%= pkg.author.name %> <<%= pkg.author.email %>>',
    ' **',
    ' ** YOU EARNED THE GEEK ACHIEVEMENT ',
    ' ** FOR LOOKING AT MY SOURCE ',
    ' **',
    ' ** But because of all the minimizing and caching ',
    ' ** going on you better check out the code on ',
    ' ** github ',
    ' ** ',
    ' ** <%= pkg.repository.url %> ',
    ' **/',
    ''
].join('\n');


// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
// Tasks
// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

//
// Delete build artifacts
//
gulp.task('clean', function(done) {
    return del([
        DIST + '/**/*',
        DIST + '/.*', // delete all hidden files
        '!' + DIST + '/media/**'
    ], done)
});


//
// Jekyll
//
gulp.task('jekyll', function(cb) {
    browser.notify('Compiling Jekyll');

    var spawn = require('child_process').spawn;

    if (isProduction) {
        process.env.JEKYLL_ENV = 'production';
        var jekyll = spawn('bundle', ['exec', 'jekyll', 'build', '--lsi'], { stdio: 'inherit' });
    } else {
        var jekyll = spawn('bundle', ['exec', 'jekyll', 'build', '--config', '_config.yml,_config.dev.yml', '--drafts', '--future', '--incremental'], { stdio: 'inherit' });
    }

    jekyll.on('exit', function(code) {
        cb(code === 0 ? null : 'ERROR: Jekyll process exited with code: ' + code);
    });
});


//
// HTML
//
gulp.task('html', function() {
    return gulp.src(DIST + '/**/*.html')
        .pipe($.if(isProduction, $.htmlmin({
            collapseWhitespace: true,
            conservativeCollapse: true,
            removeComments: true,
            useShortDoctype: true,
            collapseBooleanAttributes: true,
            removeRedundantAttributes: true,
            removeEmptyAttributes: true,
            minifyJS: true,
            minifyCSS: true
        })))
        .pipe(gulp.dest(DIST))
});


//
// Styles
//
gulp.task('css', function() {

    var processors = [
        autoprefixer({ browsers: COMPATIBILITY }),
        cssnano()
    ];

    return gulp.src([
            SRC + '/_assets/styl/kremalicious3.styl',
            SRC + '/_assets/styl/post-*.styl'
        ])
        .pipe($.if(!isProduction, $.sourcemaps.init()))
        .pipe($.stylus({ 'include css': true })).on('error', onError)
        .pipe($.postcss(processors)).on('error', onError)
        .pipe($.if(!isProduction, $.sourcemaps.write()))
        .pipe($.if(isProduction, $.header(BANNER, { pkg: pkg })))
        .pipe($.rename({ suffix: '.min' }))
        .pipe(gulp.dest(DIST + '/assets/css/'))
        .pipe(browser.stream())
});


//
// Scripts
//

// Libraries
gulp.task('js:libraries', function() {
    return gulp.src([
            'node_modules/picturefill/dist/picturefill.js'
        ])
        .pipe($.if(isProduction, $.uglify())).on('error', onError)
        .pipe($.rename({ suffix: '.min'}))
        .pipe(gulp.dest(DIST + '/assets/js/'))
});

// Project js
gulp.task('js:project', function() {
    return gulp.src(SRC + '/_assets/js/kremalicious3.js')
        .pipe($.sourcemaps.init())
        .pipe($.include()).on('error', onError)
        .pipe($.if(isProduction, $.uglify())).on('error', onError)
        .pipe($.if(!isProduction, $.sourcemaps.write()))
        .pipe($.if(isProduction, $.header(BANNER, { pkg: pkg })))
        .pipe($.rename({suffix: '.min'}))
        .pipe(gulp.dest(DIST + '/assets/js/'))
});

// Service Worker js
gulp.task('js:sw', function() {
    return gulp.src(DIST + '/service-worker.js')
        .pipe($.if(isProduction, $.uglify({
            compress: {
                drop_console: true
            }
        }))).on('error', onError)
        .pipe(gulp.dest(DIST + '/'))
});

// Collect all script tasks
gulp.task('js', ['js:libraries', 'js:project', 'js:sw'])


//
// Icons
//
gulp.task('icons', function() {
    return gulp.src(iconset.icons)
        .pipe($.rename({ prefix: iconset.prefix }))
        .pipe(gulp.dest(iconset.dist))
        .pipe($.filter('**/*.svg'))
        .pipe($.if(isProduction, $.imagemin({ svgoPlugins: [{ removeViewBox: false }] })))
        .pipe($.svgSprite(SPRITE))
        .pipe(gulp.dest(iconset.dist))
});


//
// Copy images
//
gulp.task('images', function() {
    return gulp.src([
        SRC + '/_assets/img/**/*',
        '!' + SRC + '/_assets/img/entypo/**/*'
    ])
    .pipe($.if(isProduction, $.imagemin({
        optimizationLevel: 5, // png
        progressive: true, // jpg
        interlaced: true, // gif
        multipass: true, // svg
        svgoPlugins: [{ removeViewBox: false }]
    })))
    .pipe(gulp.dest(DIST + '/assets/img/'))
});


//
// Copy fonts
//
gulp.task('fonts', function() {
    return gulp.src(SRC + '/_assets/fonts/**/*')
        .pipe(gulp.dest(DIST + '/assets/fonts/'))
});


//
// Copy media
//
gulp.task('media', function() {
    return gulp.src(SRC + '/_media/**/*')
        .pipe(gulp.dest(DIST + '/media/'))
});


//
// Revision static assets
//
gulp.task('rev', function() {
    // globbing is slow so do everything conditionally for faster dev build
    if (isProduction) {
        return gulp.src(DIST + '/assets/**/*.{css,js,png,jpg,jpeg,svg,eot,ttf,woff}')
            .pipe($.if(isProduction, $.rev()))
            .pipe(gulp.dest(DIST + '/assets/'))
            // output rev manifest for next replace task
            .pipe($.if(isProduction, $.rev.manifest()))
            .pipe(gulp.dest(DIST + '/assets/'))
    }
});


//
// Replace all links to assets in files
// from a manifest file
//
gulp.task('rev:replace', function() {
    // globbing is slow so do everything conditionally for faster dev build
    if (isProduction) {
        var manifest = gulp.src(DIST + '/assets/rev-manifest.json');
        return gulp.src(DIST + '/**/*.{html,xml,txt,json,css,js,png,jpg,jpeg,svg,eot,ttf,woff}')
            .pipe($.if(isProduction, $.revReplace({ manifest: manifest })))
            .pipe(gulp.dest(DIST))
    }
});


//
// Dev Server
//
gulp.task('server', ['build'], function() {
    browser.init({
        server: DIST,
        port: PORT,
        reloadDebounce: 2000
    });
});


// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
// Task sequences
// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


//
// Build site, run server, and watch for file changes
//
gulp.task('default', ['build', 'server'], function() {
    gulp.watch([SRC + '/_assets/styl/**/*.styl'], ['css']);
    gulp.watch([SRC + '/_assets/js/*.js'], ['js', browser.reload]);
    gulp.watch([SRC + '/_assets/img/**/*.{png,jpg,jpeg,gif}'], ['images', browser.reload]);
    gulp.watch([SRC + '/_assets/img/**/*.{svg}'], ['icons', browser.reload]);
    gulp.watch([SRC + '/_media/**/*'], ['media', browser.reload]);
    gulp.watch([SRC + '/**/*.{html,xml,json,txt,md,yml}', './*.yml'], ['build', browser.reload]);
});


//
// Full build
//
gulp.task('build', function(done) {

    console.log($.util.colors.gray("         ------------------------------------------"));
    console.log($.util.colors.green('                Building ' + ($.util.env.production ? 'production' : 'dev') + ' version...'));
    console.log($.util.colors.gray("         ------------------------------------------"));

    runSequence(
        'clean',
        'jekyll',
        ['html', 'css', 'js', 'images', 'icons', 'fonts', 'media'],
        'rev',
        'rev:replace',
        done
    );
});


//
// Deploy to S3
//
gulp.task('deploy', function() {

    // create publisher, define config
    var publisher = $.awspublish.create({
        params: {
            "Bucket": S3BUCKET
        },
        "accessKeyId": process.env.AWS_ACCESS_KEY,
        "secretAccessKey": process.env.AWS_SECRET_KEY,
        "region": S3REGION
    });

    return gulp.src(DIST + '/**/*')
        .pipe($.awspublishRouter({
            cache: {
                // cache for 5 minutes by default
                cacheTime: 300
            },
            routes: {
                // all static assets, cached & gzipped
                '^assets/(?:.+)\\.(?:js|css|png|jpg|jpeg|gif|ico|svg|ttf)$': {
                    cacheTime: 2592000, // cache for 1 month
                    gzip: true
                },

                // every other asset, cached
                '^assets/.+$': {
                    cacheTime: 2592000  // cache for 1 month
                },

                // all html files, not cached & gzipped
                '^.+\\.html': {
                    cacheTime: 0,
                    gzip: true
                },

                // pass-through for anything that wasn't matched by routes above, to be uploaded with default options
                "^.+$": "$&"
            }
        }))
        // make sure everything goes to the root '/'
        .pipe($.rename(function (path) {
            path.dirname = S3PATH + path.dirname;
        }))
        .pipe(parallelize(publisher.publish(), 100))
        .pipe(publisher.sync()) // delete files in bucket that are not in local folder
        .pipe($.awspublish.reporter({
            states: ['create', 'update', 'delete']
        }));
});
