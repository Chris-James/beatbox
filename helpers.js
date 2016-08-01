
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
  // getContent: function(inputPath) {
  //   map.set('currentLocation', inputPath);
  //   footer.set('currentLocation', inputPath);
  //   if (_.has(HISTORY, inputPath)) {
  //     allItems = HISTORY[inputPath];
  //     footer.fire('showAllItems');
  //   } else {
  //     dbx.filesListFolder({path: inputPath})
  //       .then(response => {
  //         let newItems = [];
  //         response.entries.forEach(item => {
  //
  //           let itemType = item['.tag'];
  //           let itemName = item.name;
  //           let itemPath = item.path_lower;
  //
  //           if (isFolder(itemType) || isSong(itemName)) {
  //
  //             // Remove file format from songs
  //             itemName = isSong(itemName) ? itemName.slice(0,-4) : itemName;
  //
  //             newItems.push({
  //               'type': itemType,
  //               'name': itemName,
  //               'path': itemPath
  //             });
  //           }
  //         });
  //         allItems = newItems;
  //         HISTORY[inputPath] = newItems;
  //         footer.fire('showAllItems');
  //       })
  //       .catch(error => {
  //         console.log(error)
  //          alert(`Error in getContent: ${error}`);
  //       });
  //   }
  // },
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
}
};
