var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');

var sessionCreator = require('express-session'); 
var bcrypt = require('bcrypt-nodejs');

var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));


// we add
app.set('trust proxy', 1);

app.use(sessionCreator({
  secret: 'keyboard cat'//,
  // resave: false,
  // saveUninitialized: true,
  // cookie: { secure: true }
}));

// function restrict(req, res, next) {
//   if (req.session.user) {
//     next();
//   } else {
//     req.session.error = 'Access denied!';
//     res.redirect('/login');
//   }
// }

app.get('/', util.restrict,
function(req, res) {
  res.render('index');
});

app.get('/create', util.restrict,
function(req, res) {
  res.render('index');
});

app.get('/links', util.restrict,
function(req, res) {
  Links.reset().fetch().then(function(links) {
    var filteredLinks = links.models.filter(function(link) {
      return link.attributes.username === req.session.user;
    });
    res.status(200).send(filteredLinks);
  });
});

app.post('/links', util.restrict,
function(req, res) {
  var uri = req.body.url;
  if (!util.isValidUrl(uri)) {
    return res.sendStatus(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.status(200).send(found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.sendStatus(404);
        }
        Links.create({
          url: uri,
          title: title,
          baseUrl: req.headers.origin,
          username: req.session.user
        })
        .then(function(newLink) {
          res.status(200).send(newLink);
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
  res.render('login');
});


app.post('/login',
  function(req, res) {
    var user = req.body.username;
    var newPassword = req.body.password;

    new User({username: user}).fetch().then(function(found) {
      if (!found) {
        res.redirect('/login');
      } else {
        bcrypt.compare(newPassword, found.get('password'), function(err, response) {
          if (response) {
            req.session.regenerate(function() {
              req.session.user = user;
              res.redirect('/');  
            });            
          } else if (err) {
            console.log('error: ', err);
          } else {
            res.redirect('/login');
          }
        });
      } 
    });
  }
);


app.get('/logout', 
function(req, res) {
  req.session.destroy();
  res.redirect('/login');
});



app.get('/signup', 
function(req, res) {
  res.render('signup');
});



app.post('/signup', 
function(req, res) {
  var user = req.body.username;
  var newPassword = req.body.password;
  var salt = bcrypt.genSaltSync(10);
  var hash = bcrypt.hashSync(newPassword, salt);

  new User({username: user}).fetch().then(function(found) {
    if (found) {
      res.redirect('signup');
    } else {
      Users.create({
        username: user,
        password: hash
      }).then(function() {
        res.redirect('login');
      });
    }
  });
});


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
        linkId: link.get('id')
      });

      click.save().then(function() {
        link.set('visits', link.get('visits') + 1);
        link.save().then(function() {
          return res.redirect(link.get('url'));
        });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);