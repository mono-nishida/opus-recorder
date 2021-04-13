const path = require('path');

module.exports = {
  mode: 'production',
  output: {
    globalObject: 'typeof self !== \'undefined\' ? self : this',
    library: 'test',
    libraryTarget: 'umd',
    path: path.resolve(__dirname, "dist")
  },
  module: {
    rules: [
      {
        test: /\.m?js$/,
        exclude: /(node_modules)/,
        use: [{
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env']
          }
        }]
      }
    ]
  }
};
