import React, { Component, createRef, useEffect } from 'react';

import Table from 'react-bootstrap/Table';
import Col from 'react-bootstrap/Col';
import Row from 'react-bootstrap/Row';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';

import {Typeahead} from 'react-bootstrap-typeahead';
import 'react-bootstrap-typeahead/css/Typeahead.css';


import pako from 'pako';
import {parseMMCIF,parsePDB,isAminoAcidType,isWaterType} from './mgMiniMol.js';

import {wizards} from './mgWizard.js';

import configData from "./config.json";

import ColoredLine from './ColoredLine.js';

import { guid } from './guid.js';

const Spacer = props => {
  return (
    <div style={{height:props.height}}></div>
  );
}

function splitQuotedCIFString(stringToSplit){
    if(stringToSplit.length===0) return [];
    return stringToSplit.match(/(?:[^\s"]+|"[^"]*")+/g);
}

function getLoop(lines,loopName_in){
    let loopName = loopName_in+".";
    let inWantedLoop = false;
    let loopLines = [];
    let len = lines.length;
    for(let il=0;il<len;il++){
        let l = lines[il].replace(/(^\s+|\s+$)/g,'');
        if(l === "loop_"||(l.substring(0,1)==="_"&&l.substring(0,loopName.length)!==loopName)){
            if(inWantedLoop){
                break;
            }else{
                if(il<lines.length){
                    if(lines[il+1].substring(0,loopName.length) === loopName){
                        inWantedLoop = true;
                    }
                }
            }
        }else{
            if(inWantedLoop){
                loopLines.push(l);
            }
        }
    }
    return loopLines;
}

function makeRequest (method, url) {
  return new Promise(function (resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.onload = function () {
      if (this.status >= 200 && this.status < 300) {
        resolve(xhr.response);
      } else {
        reject({
          status: this.status,
          statusText: xhr.statusText
        });
      }
    };
    xhr.onerror = function () {
      reject({
        status: this.status,
        statusText: xhr.statusText
      });
    };
    xhr.send();
  });
}

class MGWebWizardUI extends Component {

    parametersChanged() {
        //FIXME - load new file should not delete existing files; change of wizard should delete buffers associated with that file.
        console.log(this.state.pending);
        var pending;
        if(!this.state.pending) return;
        if(this.state.pending.big){
            pending = {fileData:this.state.pending.fileData,atoms:this.state.pending.atoms,wizard:"Bonds",name:this.state.pending.name};
        } else {
            pending = {fileData:this.state.pending.fileData,atoms:this.state.pending.atoms,wizard:this.state.wizard,name:this.state.pending.name};
        }
        try {
            this.props.onChange(pending);
        } catch(e) {
            console.log("Fail");
            console.log(e);
            //Ignore
        }
    }
    constructor(props){
        super(props);
        this.state = {pdbcode:'',wizard:'Bonds', theAtoms : [], showModalGetSmiles: false, showModalGetMonomer: false, smilesname:'DRG', smiles:'', monomerid:'', ligands:[]};
        this.enerLib = this.props.enerLib;
        this.inputRef = createRef();
        this.cifinputRef = createRef();
        this.myWorkerPDB = new window.Worker('wasm/pdb_worker.js');
        this.keyGetSmiles = guid();
        this.keyGetMonomer = guid();
        this.keyAddModalGetSmiles = guid();
        this.keyAddModalGetMonomer = guid();
        var self = this;
        this.myWorkerPDB.onmessage = function(e) {
            if(e.data[0]==="output"){
                //console.log(e.data[1]);
            }
            if(e.data[0]==="result"){
                self.props.onSVGChange({svg:e.data[1]});
            }
            if(e.data[0]==="glycan_result"){
                self.props.onGlycanChange({glycans:e.data[1]});
            }
        }
        this.myWorkerSMILES = new window.Worker('wasm/smiles_to_pdb_worker.js');
        this.myWorkerSMILES.onmessage = function(e) {
            if(e.data[0]==="result"){
                console.log(e.data[1]);
                self.props.onSVGChange({svg:e.data[1]});
            }
        }
        this.myWorkerGetMonomer = new window.Worker('wasm/monid_to_pdb_worker.js');
        this.myWorkerGetMonomer.onmessage = function(e) {
            if(e.data[0]==="result"){
                self.props.onSVGChange({svg:e.data[1]});
            }
            if(e.data[0]==="pdb"){
                let pdbatoms = parsePDB(e.data[1].split("\n"),"aname");
                self.setState({pending:{fileData:{contents:e.data[1],isPDB:true},atoms:pdbatoms,big:false,name:"aname"}},()=> {self.parametersChanged(); });
                self.setState({theAtoms: pdbatoms});
            }
        }
    }

    handleShowGetSmiles(){
        console.log("handleShowGetSmiles");
        this.setState({ showModalGetSmiles: true });
    }

    handleCloseGetSmilesApplyThis(){
        console.log(this.state.smilesname);
        console.log(this.state.smiles);
        this.myWorkerSMILES.postMessage([this.state.smiles,this.state.smilesname]);
        //const mol = RDKit.get_mol(this.state.smiles);
        this.setState({ showModalGetSmiles: false });
    }

    handleCloseGetSmilesCancelThis(){
        this.setState({ showModalGetSmiles: false });
    }

    componentDidMount() {
        var self = this;
        const ligandServer = configData["MONOMER_LIBRARY_SERVER_URL"];
        const theUrl = ligandServer + "/list/mon_lib_list.cif";
        makeRequest('GET',theUrl , true).then(function (ligandListCif) {
                const ligandListLines = ligandListCif.split("\n");
                const ligandList = getLoop(ligandListLines,"_chem_comp");
                let ligands = [];
                let libLigandListTypes = [];
                for(let il=0;il<ligandList.length;il++){
                    if(ligandList[il].substr(0,1)==="#"||ligandList[il].trim()===""){
                        continue;
                    } else if(ligandList[il].substr(0,1)==="_"){
                        libLigandListTypes.push(ligandList[il]);
                    } else {
                        ligands.push(ligandList[il]);
                        /*
                        //Not sure we need the data structured - strings will do for my purposes as long as first one is id?
                        let split = splitQuotedCIFString(ligandList[il]);
                        if(split[0]!=="."){
                            let atom = {};
                            for(let iprop=0;iprop<split.length;iprop++){
                                atom[libLigandListTypes[iprop]] = split[iprop];
                            }
                            ligands.push(atom);
                        }
                        */
                    }
                }
                self.setState({ligands:ligands});
        })
        .catch(function (err) {
                console.error('Aargh, there was an error!', err.statusText);
        });
    }

    handleCloseGetMonomerApplyThis(){
        this.setState({ showModalGetMonomer: false });
        const monid = splitQuotedCIFString(this.state.monomerid)[0];
        this.myWorkerGetMonomer.postMessage([monid]);
    }

    handleSmilesNameChange(e){
        this.setState({smilesname: e.target.value});
    }

    handleSmilesStringChange(e){
        this.setState({smiles: e.target.value});
    }

    handleMonomerIdChange(e){
        this.setState({monomerid: e.target.value});
    }

    handleCloseGetMonomerCancelThis(){
        this.setState({ showModalGetMonomer: false });
    }

    handleShowGetMonomer(){
        this.setState({ showModalGetMonomer: true });
    }

    loadPdb(){
        console.log("Load PDB (and dicts)");
        var self = this;
        function uploadCIF(file) {
            if(file.files.length===0) return;
            for(let fno=0;fno<file.files.length;fno++){
                let f = file.files[fno];
                let r = new FileReader();
                r.onload = function(e) { 
                    var contents = e.target.result;
                    var ligand = self.enerLib.getMonIDFromCIF(contents);
                    if(ligand){
                        self.enerLib.addCIFAtomTypes(ligand,contents);
                        self.enerLib.addCIFBondTypes(ligand,contents);
                    }
                }
                r.readAsText(f);
            }
        }
        function upload(file) {
            var r = new FileReader();
            if(file.files.length===0) return;
            var f = file.files[0];
            r.onload = function(e) { 
                var contents = e.target.result;
                var pdbatoms;
                let isPDB = false;
                if(f.name.endsWith(".pdb")||f.name.endsWith(".ent")){
                    pdbatoms = parsePDB(contents.split("\n"),f.name.replace(/\.[^/.]+$/, ""));
                    isPDB = true;
                } else {
                    pdbatoms = parseMMCIF(contents.split("\n"),f.name.replace(/\.[^/.]+$/, ""));
                }
                self.myWorkerPDB.postMessage([contents, f.name]);
                const ligandTypes = pdbatoms["restypes"].filter(word => !isAminoAcidType(word) && !isWaterType(word));
                for(let ilig=0;ilig<ligandTypes.length;ilig++){
                    let ligType = ligandTypes[ilig];
                    let ligandServer = configData["MONOMER_LIBRARY_SERVER_URL"];
                    if(!(ligType in self.enerLib.monLibBonds)){
                        let theUrl = ligandServer+ligType.toLowerCase()[0]+"/"+ligType.toUpperCase()+".cif";
                        console.log("Server",ligandServer);
                        console.log("Getting",theUrl);
                        makeRequest('GET',theUrl,true).then(function (ligandlines) {
                                console.log("Adding",ligType);
                                console.log(ligandlines);
                                self.enerLib.addCIFAtomTypes(ligType,ligandlines);
                                self.enerLib.addCIFBondTypes(ligType,ligandlines);
                                })
                        .catch(function (err) {
                                console.error('Aargh, there was an error!', err.statusText);
                                });
                    }

                }
                self.setState({pending:{fileData:{contents:contents,isPDB:isPDB},atoms:pdbatoms,big:false,name:f.name.substring(0, f.name.lastIndexOf('.'))}},()=> {self.parametersChanged(); });
                self.setState({theAtoms: pdbatoms});
            }
            r.readAsText(f);
        }
        uploadCIF(this.cifinputRef.current);
        console.log(this.inputRef.current);
        upload(this.inputRef.current);
    }

    getLigand(ligand){
        var self = this;
        if(!(ligand in self.enerLib.monLibBonds)){
            console.log("Getting",ligand);
            makeRequest('GET', "https://files.rcsb.org/ligands/download/"+ligand+".cif", true).then(function (ligandlines) {
                    console.log("Adding",ligand);
                    console.log(ligandlines);
                    self.enerLib.addCIFAtomTypes(ligand,ligandlines);
                    self.enerLib.addCIFBondTypes(ligand,ligandlines);
                    })
            .catch(function (err) {
                    console.error('Aargh, there was an error!', err.statusText);
                    });
        }
    }
    getPdb(){
        console.log("Get PDB");
        console.log(this.state);
        console.log(this.enerLib);
        var self = this;
        var useGzip = true;
        let mygetrequest=new XMLHttpRequest();
        mygetrequest.onreadystatechange=function(){
            var start = new Date().getTime();
            if (mygetrequest.readyState===4){
                if (mygetrequest.status===200 || window.location.href.indexOf("http")===-1){
                    console.log("Time to get files: "+(new Date().getTime()-start));
                    //console.log(mygetrequest.responseText);

                    var strData = "";
                    if(useGzip){
                        var data  = pako.inflate(mygetrequest.response);
                        console.log("Time to inflate: "+(new Date().getTime()-start));
                        strData = "";

                        if(window.TextDecoder){
                            // THIS'LL only work in Firefox 19+, Opera 25+ and Chrome 38+.
                            var decoder = new TextDecoder('utf-8');
                            strData = decoder.decode(data);
                        } else {
                            var unpackBufferLength = 60000;
                            for(var j=0;j<data.length/unpackBufferLength;j++){
                                var lower = j*unpackBufferLength;
                                var upper = (j+1)*unpackBufferLength;
                                if(upper>data.length){
                                    upper = data.length;
                                }
                                // FECK, no slice on Safari!
                                strData += String.fromCharCode.apply(null, data.subarray(lower,upper));
                            }   
                        }
                    } else {
                        strData = mygetrequest.responseText;
                    }

                    var dataSplit = strData.split("\n");
                    console.log("Time to split data into lines: "+(new Date().getTime()-start));
                    var cifatoms = parseMMCIF(dataSplit,self.state.pdbcode);
                    self.myWorkerPDB.postMessage([strData, self.state.pdbcode+".ent"]);
                    console.log("Time to parse data: "+(new Date().getTime()-start));
                    console.log(cifatoms);
                    console.log(self.enerLib);
                    if(dataSplit.length>100000){
                        self.setState({pending:{fileData:{contents:strData,isPDB:false},atoms:cifatoms,big:true,name:self.state.pdbcode}},()=> {self.parametersChanged(); });
                    } else {
                        self.setState({pending:{fileData:{contents:strData,isPDB:false},atoms:cifatoms,big:false,name:self.state.pdbcode}},()=> {self.parametersChanged(); });
                    }
                    self.setState({theAtoms: cifatoms});
                }
            }
        }
        function getDictsAndCoords(){
            var start = new Date().getTime();
            console.log("Starting download");
            console.log("....");
            var ligandsrequest=new XMLHttpRequest();
            ligandsrequest.onreadystatechange=function(){
                if (ligandsrequest.readyState===4){
                    if (ligandsrequest.status===200 || window.location.href.indexOf("http")===-1){
                        var ligresp = JSON.parse(ligandsrequest.responseText);
                        var ligands = [];
                        if(typeof(ligresp[self.state.pdbcode])!=="undefined"){
                            for(var ilig=0;ilig<ligresp[self.state.pdbcode].length;ilig++){
                                if(typeof(ligresp[self.state.pdbcode][ilig]["chem_comp_id"])!=="undefined"){
                                    if(ligands.indexOf(ligresp[self.state.pdbcode][ilig]["chem_comp_id"])===-1){
                                        ligands.push(ligresp[self.state.pdbcode][ilig]["chem_comp_id"]);
                                    }
                                }
                            }
                        }
                        function getCoordFile(){
                            console.log("getCoordFile");
                            var urlsrequest=new XMLHttpRequest();
                            urlsrequest.onreadystatechange=function(){
                                if (urlsrequest.readyState===4){
                                    if (urlsrequest.status===200 || window.location.href.indexOf("http")===-1){
                                        var resp = JSON.parse(urlsrequest.responseText);
                                        if(typeof(resp[self.state.pdbcode])!=="undefined" && typeof(resp[self.state.pdbcode]["PDB"])!=="undefined" && typeof(resp[self.state.pdbcode]["PDB"]["downloads"])!=="undefined"){
                                            var dl = resp[self.state.pdbcode]["PDB"]["downloads"];
                                            var theUrl = null;
                                            // FIXME use updated  mmcif it has chem comp.
                                            for(var idl=0;idl<dl.length;idl++){
                                                if(typeof(dl[idl]["label"]!=="undefined")&&dl[idl]["label"]==="Archive mmCIF file"&&typeof(dl[idl]["url"]!=="undefined")){
                                                    theUrl = dl[idl]["url"];
                                                    break;
                                                }
                                            }
                                            if(useGzip) theUrl = "https://files.rcsb.org/download/"+self.state.pdbcode.toUpperCase()+".cif.gz";
                                            console.log(theUrl);
                                            if(theUrl){
                                                mygetrequest.open("GET", theUrl, true);
                                                if(useGzip) mygetrequest.responseType = "arraybuffer";
                                                mygetrequest.send(null);
                                            }
                                        }
                                    }
                                }
                            }
                            urlsrequest.open("GET", "https://www.ebi.ac.uk/pdbe/api/pdb/entry/files/"+self.state.pdbcode, true);
                            urlsrequest.send(null);
                        }
                        console.log("Time to before getLigand: "+(new Date().getTime()-start));
                        if(ligands.length===0){
                            console.log("Time to before getCoordFile: "+(new Date().getTime()-start));
                            getCoordFile();
                        } else {
                            //var chemCompUrl = "https://files.rcsb.org/ligands/download/NEG.cif";
                            for(var il=0;il<ligands.length;il++){
                                console.log("Call getLigand",ligands[il]);
                                self.getLigand(ligands[il]);
                            }
                            getCoordFile();
                        }
                    }
                }
            }
            try {
                ligandsrequest.open("GET", "https://www.ebi.ac.uk/pdbe/api/pdb/entry/ligand_monomers/"+self.state.pdbcode, true);
                ligandsrequest.send(null);
            } catch(e){
                console.log("A problem");
                console.log(e);
            }
        }
        getDictsAndCoords();
    }

    addDictionary(){
        console.log("Add dict");
    }

    handlePdbCodeChange(e){
        this.setState({pdbcode: e.target.value});
    }

    handlePdbFileChange(e){
        this.setState({pdbfile: e.target.value});
    }

    setMonomerIdSingleSelections (e) {
        this.state.monomerid = e[0];
    }

    handleSelect (e) {
        var self = this;
        console.log(e.target.value);
        this.setState({wizard: e.target.value},()=> {self.parametersChanged(); });
    }

    render () {
        const options = Object.keys(wizards).map((item) => {
                return (
                        <option key={item} value={item}>
                        {item}
                        </option>
                       )
                });
        const keyGetSmiles = this.keyGetSmiles;
        const keyAddModalGetSmiles = this.keyAddModalGetSmiles;
        const handleShowGetSmiles = this.handleShowGetSmiles.bind(this);
        const handleCloseGetSmilesCancelThis = this.handleCloseGetSmilesCancelThis.bind(this);
        const handleCloseGetSmilesApplyThis = this.handleCloseGetSmilesApplyThis.bind(this);
        const showModalGetSmiles = this.state.showModalGetSmiles;

        const keyGetMonomer = this.keyGetMonomer;
        const keyAddModalGetMonomer = this.keyAddModalGetMonomer;
        const handleShowGetMonomer = this.handleShowGetMonomer.bind(this);
        const handleCloseGetMonomerCancelThis = this.handleCloseGetMonomerCancelThis.bind(this);
        const handleCloseGetMonomerApplyThis = this.handleCloseGetMonomerApplyThis.bind(this);
        const showModalGetMonomer = this.state.showModalGetMonomer;

        const handleSmilesNameChange = this.handleSmilesNameChange.bind(this);
        const handleSmilesStringChange = this.handleSmilesStringChange.bind(this);
        const handleMonomerIdChange = this.handleMonomerIdChange.bind(this);
        const setMonomerIdSingleSelections = this.setMonomerIdSingleSelections.bind(this);

        let modals = [];
        modals.push(
            <Modal key={keyAddModalGetSmiles} show={showModalGetSmiles} onHide={handleCloseGetSmilesCancelThis}>
               <Modal.Header closeButton>
                   <Modal.Title>Generate structure from SMILES string</Modal.Title>
               </Modal.Header>
               <Modal.Body>Generate structure from SMILES string (this does not work yet!)
                  <h4>Molecule name</h4>
                  <Form.Control type="text" value={this.state.smilesname} placeholder="DRG" onChange={handleSmilesNameChange}/>
                  <h4>SMILES string</h4>
                  <Form.Control as="textarea" rows={6} value={this.state.smiles} onChange={handleSmilesStringChange}/>
               </Modal.Body>
               <Modal.Footer>
                   <Button variant="primary" onClick={handleCloseGetSmilesApplyThis}>
                      Generate molecule 
                   </Button>
                   <Button variant="secondary" onClick={handleCloseGetSmilesCancelThis}>
                      Cancel 
                   </Button>
               </Modal.Footer>
            </Modal>
               );
        modals.push(
            <Modal key={keyAddModalGetMonomer} show={showModalGetMonomer} onHide={handleCloseGetMonomerCancelThis}>
               <Modal.Header closeButton>
                   <Modal.Title>Generate structure from monomer id</Modal.Title>
               </Modal.Header>
               <Modal.Body>Generate structure from monomer id (this does not work yet!)
                  <h4>Monomer id</h4>
                  {/*
                  <Form.Control type="text" value={this.state.monomerid} onChange={handleMonomerIdChange}/>
                  */}
                  <Typeahead
                    id="basic-typeahead-single"
                    onChange={setMonomerIdSingleSelections}
                    options={this.state.ligands}
                    placeholder="Start typing monomer name or description..."
                  />
               </Modal.Body>
               <Modal.Footer>
                   <Button variant="primary" onClick={handleCloseGetMonomerApplyThis}>
                      Get monomer 
                   </Button>
                   <Button variant="secondary" onClick={handleCloseGetMonomerCancelThis}>
                      Cancel 
                   </Button>
               </Modal.Footer>
            </Modal>
               );
        return (<>
        <Form>
        <Form.Group as={Row} controlId="getpdb">
        <Col>
        <Form.Control type="text" onChange={this.handlePdbCodeChange.bind(this)} placeholder="PDB code" value={this.state.pdbcode} />
        </Col>
        <Col>
        <Button onClick={this.getPdb.bind(this)}>Get PDB</Button>
        </Col>
        </Form.Group>
        <Spacer height="1rem" />
        <Form.Group controlId="loadpdb">
        <Form.Label>Browse for coordinate file</Form.Label>
        <Form.Control ref={this.inputRef} type="file" />
        </Form.Group>
        <Spacer height="1rem" />
        <Form.Group controlId="loaddictionary">
        <Form.Label>Dictionary(ies)</Form.Label>
        <Form.Control ref={this.cifinputRef} type="file" multiple />
        </Form.Group>
        <Spacer height="1rem" />
        <Form.Group controlId="loadpdbanddictionaries">
        <Button onClick={this.loadPdb.bind(this)}>Load PDB (and dictionaries)</Button>
        </Form.Group>
        <Spacer height="1rem" />
        <Form.Select aria-label="Default select example" onChange={this.handleSelect.bind(this)}>
        {options}
        </Form.Select>
        </Form>
        <ColoredLine color="blue" />
        <Table>
        <tbody>
        <tr>
            <td key={keyGetSmiles}><Button variant="primary" size="sm" onClick={handleShowGetSmiles}>Generate Structure from SMILES</Button></td>
            <td key={keyGetMonomer}><Button variant="primary" size="sm" onClick={handleShowGetMonomer}>Get Monomer</Button></td>
        </tr>
        </tbody>
        </Table>
        {modals}
        </>
        );

    }

    setAtoms(atoms){
        this.theAtoms = atoms;
    }

}

export default MGWebWizardUI;
