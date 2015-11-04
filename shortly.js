var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var bcrypt = require('bcrypt');
var passport = require('passport');
var GitHubStrategy = require('passport-github2').Strategy;


var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var app = express();

passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});

passport.use(new GitHubStrategy({
    clientID: 'INSERTCLIENTIDHERE',
    clientSecret: 'CLIENTSECRETGOESHERE',
    callbackURL: "http://localhost:4568/auth/github/callback"
  },
  function(accessToken, refreshToken, profile, done) {
    process.nextTick(function () {
      return done(null, profile);
    });
  }
));

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));


app.use(cookieParser());
app.use(session({
  secret: 'cookiecookiecookie',
  saveUninitialized: true,
  resave: false
}));

app.get('/', function(req, res) {

  if (!req.session.isAuthenticated) {
    res.redirect('/login');
  }
  res.render('index');

});

app.get('/create', function(req, res) {

  if (!req.session.isAuthenticated) {
    res.redirect('/login');
  }
  res.render('index');
});

app.get('/auth/github',
  passport.authenticate('github', { scope: [ 'user:email' ] }),
  function(req, res){
});

app.get('/auth/github/callback', 
  passport.authenticate('github', { failureRedirect: '/login' }),
  function(req, res) {
    res.redirect('/');
});

app.get('/links', function(req, res) {

  if (!req.session.isAuthenticated) {
    res.redirect('/login');
  }

  Links.reset().fetch().then(function(links) {
    res.send(200, links.models);
  });
});

app.post('/links', function(req, res) {

  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.send(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {

    if (found) {
      res.send(200, found.attributes);
    } else {

      util.getUrlTitle(uri, function(err, title) {

        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.send(404);
        }

        Links.create({
          url: uri,
          title: title,
          base_url: req.headers.origin,
          user_id: req.session.user
        })
        .then(function(newLink) {
          res.send(200, newLink);
        });

      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/

app.get('/login', 
function(req, res) {
  if (req.session.isAuthenticated) {
    console.log('you are logged in as ' + req.session.user);
    res.redirect('/');
  }
  res.render('login');
});

app.post('/login', function(req, res) {

  var username = req.body.username;
  var password = req.body.password;

  new User({ username: username}).fetch().then(function(found) {

    if (found) {

      // HASH CHECK HERE
      bcrypt.compare(password, found.attributes.password, function(err, valid) {

        if (valid) {

          console.log('after comparing hash, this is the result: ' + valid);
          req.session.regenerate(function() {
            req.session.isAuthenticated = true;
            req.session.user = username;
            console.log('Welcome back, ' + req.session.user);
            res.redirect('/');
          })

        } else {
          
          console.log('Bad password/username combo on sign up. Redirected to login.');
          res.redirect('/login');

        }

      });

    } else {

      console.log('Bad password/username combo on sign up. Redirected to login.');
      res.redirect('/login');

    }
  });

});

app.get('/logout',
  function(req, res) {
    req.session.destroy(function(err) {
      res.redirect('/login');
    });
  })

app.get('/signup', 
  function(req, res) {
    res.render('signup');
  })

app.post('/signup',
  function(req, res) {

    var username = req.body.username;
    var password = req.body.password;

    // build new model instance of User and see if already exists
    new User({ username: username}).fetch().then(function(found) {
      if (found) {

        // HASH CHECK HERE
        bcrypt.compare(password, found.attributes.password, function(err) {

          if (err) {

            console.log('Bad password/username combo on sign up. Redirected to login.');
            res.redirect('/login');

          } else {

            req.session.regenerate(function() {
              req.session.isAuthenticated = true;
              req.session.user = username;
              console.log('Welcome back, ' + req.session.user);
              res.redirect('/');
            })

          }
        });

      } else {

        bcrypt.hash(password, 10, function(err, hash) {

          if (err) {
            throw err;
          } else {
            console.log('new passwordhash: ' + hash);
            Users.create({
              username: username,
              password: hash,
            })
            .then(function(newUser) {
              console.log('Welcome new user, ' + username);
              // login this user
              req.session.regenerate(function() {
                req.session.user = username;
                req.session.isAuthenticated = true;
                console.log('Welcome to Shortly, ' + req.session.user);
                res.redirect('/');
              })
            });

          }
        })

      }
    });
  })

/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        link_id: link.get('id')
      });

      click.save().then(function() {
        link.set('visits', link.get('visits')+1);
        link.save().then(function() {
          return res.redirect(link.get('url'));
        });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);
