// TODO:
//  Fix remove item from playlist bug (removes multiple items)

const Client = require('electron-rpc/client')
const Ractive = require('ractive');
require("ractive-require-templates");
require('ractive-animatecss');

let audio;
const client = new Client()

const config = require('./config');
const request = require("request");

// Dropbox
const Dropbox = require('dropbox');
const dbx = new Dropbox({ accessToken: config.accessToken });

// Helper Functions
const _ = require('lodash');
const isFolder = require("./helpers").isFolder;
const isSong = require("./helpers").isSong;
const playSongs = require("./helpers").playSongs;
const reverse = require("./helpers").reverseString;

const app = new Ractive({
  el: '#app',
  template: require('./views/app.html'),
  partials: {
    header: require('./views/header.html'),
    search: require('./views/search.html'),
    map: require('./views/map.html'),
    list: require('./views/list.html'),
    // playlist: require('./views/playlist.html'),            // Saved for future refactor
    // searchResults: require('./views/search-results.html'), // Saved for future refactor
    footer: require('./views/footer.html')
  },
  data: {
    appName: 'Beatbox',
    currentlyActive: '',
    rootDirectory: config.dirPath,
    currentLocation: config.dirPath,
    items: [],
    playlist: [],
    searchResults: [],
    history: {},
    playlistActive: false,
    searchActive: false,
    playlistPosition: 0,
    paused: false,
    playing: false,
    allowJump: false,
    currentlyPlaying: '',
    inPlaylist: function(name) {
      return _.findIndex(this.get('playlist'), function(song) { return song.name === name }) >= 0;
    },
    isCurrentlyActive: function(name) {

      /**
       * @desc Used in item partial (in app.html) to apply the .selected class
       * when an item is clicked.
       *
       * @param name {string} the file or folder name
      **/

      return this.get('currentlyActive') === name;
    },
    isCurrentlyPlaying: function(name) {
      return this.get('currentlyPlaying') === name;
    },
    getPrettyLocation: function() {

      /**
       * @desc ...
       *
      **/

      let playlistActive = !!this.get('playlistActive');
      let searchActive = !!this.get('searchActive');

      let x = this.get('currentLocation');
      let location = '';

      if (playlistActive) {
        location = 'Playlist';
      } else if (searchActive) {
        location = 'Search Results';
      } else {
        location = _.startCase(x.slice(x.lastIndexOf('/') + 1));
      }
      return location;
    }
  }
});

app.on({

  quit: function() {
    client.request('terminate');
  },

  jumpForward: function() {

    // Stop the current song
    audio.pause();
    audio.currentTime = 0;
    this.set('playing', false);

    this.fire('play');
  },

  jumpBack: function() {

    if (this.get('allowJump')) {

      // Stop the current song
      audio.pause();
      audio.currentTime = 0;
      this.set('playing', false);

      // NOTE: If jumpBack is called while playing the last song in the
      // playlist, the value of playlistPosition will be set to -1.
      // Since the next value is 0 (the start of the playlist) it doesn't
      // cause an error in playback.
      this.subtract('playlistPosition');

      this.fire('play');
    }
  },

  pause: function() {
    audio.pause();
    this.set('paused', true);
  },

  play: function() {

    this.set('allowJump', false);
    const paused = this.get('paused');
    const playing = this.get('playing');
    const playlist = this.get('playlist');
    let position = this.get('playlistPosition');

    if (paused) {
      app.set('allowJump', true);
      audio.play()
      this.set('paused', false);
    } else {
      if (!!playlist && !playing) {

        // NOTE: playlistPosition is incremented for the next call to play.
        this.add('playlistPosition');

        // After incrementing our position, if we have reached the end of the
        // playlist, reset our position to 0 to start at the beginning again.
        if (this.get('playlistPosition') > playlist.length - 1) {
          this.set('playlistPosition', 0);
        }

        let song = _.nth(playlist, position);

        audio = new Audio(song.link);

        audio.addEventListener('playing', function() {
          app.set('playing', true);
          app.set('allowJump', true);
        });

        audio.play();
        this.set('currentlyPlaying', song.name);

        audio.addEventListener('ended', function() {
          app.set('playing', false);
          app.set('currentlyPlaying', app.get('appName'));
          app.fire('play')
        });
      }
    }
  },

  getCurrentLocation: function() {
    return this.get('currentLocation');
  },

  showPlaylist: function() {
    if (!this.get('playlistActive')) {
      this.set('playlistActive', true);
      this.set('items', this.get('playlist'));
    }
  },

  getContent: function(event, inputPath) {

    /**
     * @desc ...
     *
     * @param event {Object} event -
     * @param name {String} name -
     * @param path {String} path -
    **/

    this.set('currentLocation', inputPath);
    let history = app.get('history');

    if (_.has(history, inputPath)) {
      this.set('items', app.get(`history.${inputPath}`));
    } else {
      dbx.filesListFolder({path: inputPath})
      .then(response => {
        let newItems = [];
        response.entries.forEach(item => {

          let itemType = item['.tag'];
          let itemName = item.name;
          let itemPath = item.path_lower;

          // NOTE: Reverse the id to counteract the way Dropbox assigns ids
          // (which begins most ids with the same 19 characters). Slice the
          // first 3 chars because all ids start with 'id:'
          let itemId   = reverse(item.id.slice(3));

          if (isFolder(itemType) || isSong(itemName)) {

            // Remove file format from songs
            itemName = isSong(itemName) ? itemName.slice(0,-4) : itemName;

            newItems.push({
              'type': itemType,
              'name': itemName,
              'path': itemPath,
              'id'  : itemId
            });
          }
        });
        this.set('items', newItems);

        // Cache result in history so we don't need to hit the API if we visit
        // this directory again.
        this.set(`history.${inputPath}`, newItems);
      })
      .catch(error => {
         console.log(`Error in getContent: ${_.valuesIn(error)}`);
      });
    }
  },

  addToPlaylist: function(event, name, path) {

    /**
     * @desc Sends path to Dropbox api and gets back a link to a streamable file.
     * Pushes a new song object {name, link} and pushes it to playlist.
     *
     * @param event {Object} event -
     * @param name {String} name -
     * @param path {String} path -
    **/

    const inPlaylist = _.findIndex(this.get('playlist'), function(song) { return song.name === name }) >= 0;

    if (!inPlaylist) {

      this.set('currentlyActive', name);

      dbx.filesGetTemporaryLink({path: path})
      .then(response => {

        let song = {
          name: response.metadata.name.slice(0,-4),
          link: response.link
        };

        this.push('playlist', song);
        this.set('currentlyActive', null);

      })
      .catch(error => {
        console.log(`Error in add: ${_.valuesIn(error)}`);
      });
    } else {
      console.log('in playlit already')
    }
  },

  removeFromPlaylist: function(name) {
    this.set('currentlyActive', name);
    const newPlaylist = _.remove(this.get('playlist'), function(song) { return song.name === name });
    this.set('playlist', newPlaylist);
    this.set('currentlyActive', null)
  },

  goBack: function() {

    /**
     * @desc ...
     *
    **/

    const currentLocation = this.get('currentLocation');
    const inRootDirectory = (currentLocation === this.get('rootDirectory'));
    const playlistActive = this.get('playlistActive');
    const searchActive = this.get('searchActive');

    let destination = '';

    if (playlistActive) {
      destination = currentLocation;
      this.set('playlistActive', false);
    } else if (searchActive) {
      destination = currentLocation;
      this.set('searchActive', false);
    } else {
      destination = !inRootDirectory ? currentLocation.slice(0, currentLocation.lastIndexOf('/')) : this.get('rootDirectory');
    }

    this.fire('getContent', null, destination);

  },

  typeState: function(event) {
    this.set('searchActive', true);
    if (event.typingState === 'paused') {
      let searchTerm = event.node.value;
      if (!!searchTerm) {
        dbx.filesSearch({path: config.dirPath, query: searchTerm})
        .then(response => {
          let searchResults = [];
          response.matches.forEach(item => {
            if (isSong(item.metadata.name)) {
              searchResults.push({type: item.metadata['.tag'], name: item.metadata.name, path: item.metadata.path_lower});
            }
          });
          this.set('items', searchResults);

        })
        .then(() => {
          event.node.value = '';
        });
      }
    }
  }
});

app.fire('getContent', null, config.dirPath);
