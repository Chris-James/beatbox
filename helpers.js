
module.exports = {
  playSongs: function(playlist, inputPosition) {
    if (!!playlist) {

      // If we have reached the end of the playlist, start over from the beginning
      let position = (inputPosition === playlist.length) ? 0 : inputPosition;
      let song = playlist[position];

      // app.set('currentlyPlaying', song.name);
      audio = new Audio(song.link);
      audio.addEventListener('playing')
      audio.play();

      position++;

      audio.addEventListener('ended', () => {
        // app.set('currentlyPlaying', 'BeatBox');
        playSongs(playlist, position);
      });
    }
  },
  reverseString: function(string) {
    let output = '';
    for (let i = string.length - 1; i >= 0; i--) {
      output += string[i];
    }
    return output;
  },

  isFolder: function(type) {

    /**
     * @function isFolder
     * @param type {String} - represents file type as returned by Dropbox.
     * @return {Boolean}
    **/

    return type === 'folder';
  },
  isSong: function(name) {

    /**
     * @function isSong
     * @param name {String} - represents full name of file as returned by Dropbox.
     * @return Boolean {True | False}
    **/

    return name.slice(-4) === '.mp3' || name.slice(-4) === '.m4a';
  },
  hasValidTempLink(song) {
    const FOUR_HOURS = 14400000;

    return (Date.now() - song.generatedAt) < FOUR_HOURS;
  }
};
