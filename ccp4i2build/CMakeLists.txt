project(ccp4i2moorhen)
cmake_minimum_required(VERSION 3.13)

file(COPY 
    ../baby-gru/public 
    ../baby-gru/package-lock.json
    ../baby-gru/.babelrc 
    ../baby-gru/webpack.config.js
    ../baby-gru/src/App.css
DESTINATION ./)

file(COPY 
    ../baby-gru/src/components
    ../baby-gru/src/__tests__
    ../baby-gru/src/utils
    ../baby-gru/src/WebGLgComponents
DESTINATION ./src)