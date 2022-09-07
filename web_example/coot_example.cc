/*
 * Copyright 2013 The Emscripten Authors.  All rights reserved.
 * Emscripten is available under two separate licenses, the MIT license and the
 * University of Illinois/NCSA Open Source License.  Both these licenses can be
 * found in the LICENSE file.
 */

#include <assert.h>
#include <stdio.h>
#include <string.h>
#include <errno.h>

#include <iostream>
#include <string>
#include <vector>

#include <emscripten.h>
#include <emscripten/bind.h>

int mini_rsr_main(int argc, char **argv);

using namespace emscripten;

extern void clear_getopt_initialized();

int flipPeptide(const std::string &pdbin, const std::string &hklin, const int resno, const std::string &pdbout){
    int retval = 0;
    std::cout << "In flipPeptide in C++. This does nothing useful." << std::endl;
    std::cout << "PDBIN: " << pdbin << std::endl;
    std::cout << "HKLIN: " << hklin << std::endl;
    std::cout << "RESNO: " << resno << std::endl;
    std::cout << "PDBOUT: " << pdbout << std::endl;
    return retval;
}

int mini_rsr(const std::vector<std::string> &args){

    int argc = args.size();
    char **argv = new char*[argc];

    clear_getopt_initialized();

    for(int i=0;i<argc;i++){
        argv[i] = new char[args[i].size()+1];
        const char* arg_c = args[i].c_str();
        strcpy(argv[i], (char*)arg_c);
    }

    int retval = mini_rsr_main(argc,argv);

    for(int i=0;i<argc;i++){
        delete [] argv[i];
    }
    delete [] argv;

    return retval;
}


EMSCRIPTEN_BINDINGS(my_module) {
    register_vector<std::string>("VectorString");
    function("mini_rsr",&mini_rsr);
    function("flipPeptide",&flipPeptide);
}
