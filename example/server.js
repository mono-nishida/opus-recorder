const express = require('express');
let app = express();
let http = require('http').Server(app);
let io = require('socket.io')(http);
let port = process.env.PORT || 3000;

app.get('*', function(req, res) {
    let path = __dirname + req.path;
    console.log('load :' + path);
    res.sendFile(path);
});

io.on('connection', function(socket){
  socket.on('voice', function(buffer){
    io.emit('voice', buffer);
    console.log('voice:' + buffer.id);
  });
});

http.listen(port, function(){
  console.log('listening on *:' + port);
});

