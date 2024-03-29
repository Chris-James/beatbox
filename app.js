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
const hasValidTempLink = require("./helpers").hasValidTempLink;

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
    songs: {},
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

  stopSong: function() {

    // The audio object has no .stop() method.
    // http://stackoverflow.com/questions/14834520/html5-audio-stop-function#14836099
    audio.pause();
    this.set('playing', false);
    audio.currentTime = 0;
  },

  quit: function() {
    client.request('terminate');
  },

  jumpForward: function() {

    const currentPosition = this.get('playlistPosition');
    const lastSongOnPlaylist = (this.get('playlist').length - 1);

    if (this.get('allowJump')) {

      this.fire('stopSong');

      if (currentPosition === lastSongOnPlaylist) {
        this.set('playlistPosition', 0);
      } else {
        this.add('playlistPosition');
      }

      this.fire('play');
    }
  },

  jumpBack: function() {

    const currentPosition = this.get('playlistPosition');
    const lastSongOnPlaylist = (this.get('playlist').length - 1);

    if (this.get('allowJump')) {

      this.fire('stopSong');

      if (currentPosition === 0) {
        this.set('playlistPosition', lastSongOnPlaylist);
      } else {
        this.subtract('playlistPosition');
      }

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

  updatePlaylist: function(event, name, path, id) {

    /**
     * @desc Sends path to Dropbox api and gets back a link to a streamable file.
     * Pushes a new song object {name, link} and pushes it to playlist.
     *
     * @param event {Object} event -
     * @param name {String} name -
     * @param path {String} path -
    **/

    const currentPlaylist = this.get('playlist');
    const inPlaylist = _.findIndex(currentPlaylist, (song) => { return song.name === name }) >= 0;
    const songs = this.get('songs');
    let song;

    // The song selected is not in playlist, add it.
    if (!inPlaylist) {

      // Check if song has been requested before.
      if (_.has(songs, id)) {

        song = this.get(`songs.${id}`);

        // Dropbox temporary links expire after 4 hours.
        // If the song was originally requested more than 4 hours ago, update it.
        if (!hasValidTempLink(song)) {
          app.fire('updateTempLink', song.id, song.path);
        }

        // We have a streamable link for the song,
        // retrieve song by id & add it to playlist.
        song = this.get(`songs.${id}`);
        this.push('playlist', song);
        this.update();

      } else {

        // The song is a new request.
        // Get a streamable link for the song from Dropbox & cache it.
        dbx.filesGetTemporaryLink({path: path})
        .then(response => {

          let song = {
            id: id,
            path: path,
            name: response.metadata.name.slice(0,-4),
            link: response.link,
            generatedAt: Date.now()
          };

          // Push song onto playlist
          this.push('playlist', song);

          // Cache song with streamable link in case we request it again
          this.set(`songs.${song.id}`, song);
          this.update();
        })
        .catch(
          error => { console.error(`Error in add: ${error.error}`); }
        );
      }
    } else {

      // The song selected IS in the playlist, remove it.
      this.fire('removeSong', name);

      this.update();
    }

  },

  removeSong: function(songName) {

    /**
     * @desc Removes target song from current playlist & updates our current
     * position on the playlist if necessary.
     * @param songName {String} - The name of the song to remove.
    **/

    const currentPosition = this.get('playlistPosition');
    const indexofRemovedSong = _.findIndex(this.get('playlist'), function(song) { return song.name === songName });

    _.remove(this.get('playlist'), function(song) { return song.name === songName });

    if (indexofRemovedSong === currentPosition) {
      this.fire('stopSong');
      this.fire('play');
    } else if (indexofRemovedSong < currentPosition) {
      this.subtract('playlistPosition');
    }

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
  },

  updateTempLink: function updateTempLink(songId, path) {

    /**
     * @desc Sends 'path' to Dropbox api and gets back a link to a streamable file.
     * songId represents a song currently in our previously requested songs object.
     * Updates streamable link for song to newly returned link.
     *
     * @param songId {String} -
     * @param path {String} -
    **/

    dbx.filesGetTemporaryLink({path: path})
    .then(
      response => {
        this.set(`songs.${songId}.link`, response.link);
        this.set(`songs.${songId}.generatedAt`, Date.now());
      }
    )
    .catch(
      error => { console.error(error.error); }
    );
  }
});

app.fire('getContent', null, config.dirPath);
