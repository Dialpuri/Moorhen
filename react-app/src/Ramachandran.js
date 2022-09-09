import React, { Component, createRef } from 'react';
import reactCSS from 'reactcss'

import Col from 'react-bootstrap/Col';
import Row from 'react-bootstrap/Row';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';

import {parsePDB} from './mgMiniMol.js';

import { guid } from './guid.js';

function getOffsetRect(elem) {
    var box = elem.getBoundingClientRect();
    var body = document.body;
    var docElem = document.documentElement;

    var scrollTop = window.pageYOffset || docElem.scrollTop || body.scrollTop;
    var scrollLeft = window.pageXOffset || docElem.scrollLeft || body.scrollLeft;
    var clientTop = docElem.clientTop || body.clientTop || 0;
    var clientLeft = docElem.clientLeft || body.clientLeft || 0;
    var top  = box.top +  scrollTop - clientTop;
    var left = box.left + scrollLeft - clientLeft;
    return { top: Math.round(top), left: Math.round(left) };
}

class RamaPlot extends Component {

    draw() {
        this.fixContext();
        var ctx = this.context;
        var c = this.canvasRef.current;

        ctx.clearRect(0, 0, c.width, c.height);

        ctx.fillStyle = 'red';
        ctx.fillRect(0, 0, c.width, c.height);

        if(this.image) {
            ctx.drawImage(this.image, 0, 0, c.width, c.height);
        }

        const imageData3 = ctx.getImageData(0, 0, c.width, c.height);

        ctx.strokeStyle = 'black';
        ctx.lineWidth = 1;

        if(this.state.plotInfo&&this.imgOtherOutlier&&this.imgOtherNormal&&this.imgGlyOutlier&&this.imgProOutlier){
            for(let ip=0;ip<this.state.plotInfo.length;ip++){
                let phitest = this.state.plotInfo[ip].phi;
                let psitest = this.state.plotInfo[ip].psi;
                let x = parseInt(((phitest /180.) * 0.5 + 0.5) * c.width);
                let y = parseInt(((-psitest /180.) * 0.5 + 0.5) * c.height);

                //FIXME - Do we *know* this is RGBA?
                const r = imageData3.data[4*y*imageData3.width+4*x];
                const g = imageData3.data[4*y*imageData3.width+4*x+1];
                const b = imageData3.data[4*y*imageData3.width+4*x+2];
                if(r>250&&g>250&&b>250){
                    if(this.state.plotInfo[ip].restype==="PRO"){
                        ctx.drawImage(this.imgProOutlier, x-4, y-4, 8, 8);
                    } else if(this.state.plotInfo[ip].restype==="GLY"){
                        ctx.drawImage(this.imgGlyOutlier, x-4, y-4, 8, 8);
                    } else {
                        ctx.drawImage(this.imgOtherOutlier, x-4, y-4, 8, 8);
                    }
                } else {
                    if(this.state.plotInfo[ip].restype==="PRO"){
                        ctx.drawImage(this.imgProNormal, x-4, y-4, 8, 8);
                    } else if(this.state.plotInfo[ip].restype==="GLY"){
                        ctx.drawImage(this.imgGlyNormal, x-4, y-4, 8, 8);
                    } else {
                        ctx.drawImage(this.imgOtherNormal, x-4, y-4, 8, 8);
                    }
                }
            }
            if(this.hit>-1){
                let phitest = this.state.plotInfo[this.hit].phi;
                let psitest = this.state.plotInfo[this.hit].psi;
                console.log(this.state.plotInfo[this.hit].restype);
                let x = parseInt(((phitest /180.) * 0.5 + 0.5) * c.width);
                let y = parseInt(((-psitest /180.) * 0.5 + 0.5) * c.height);

                const r = imageData3.data[4*y*imageData3.width+4*x];
                const g = imageData3.data[4*y*imageData3.width+4*x+1];
                const b = imageData3.data[4*y*imageData3.width+4*x+2];
                if(r>250&&g>250&&b>250){
                    if(this.state.plotInfo[this.hit].restype==="PRO"){
                        ctx.drawImage(this.imgProOutlier, x-6, y-6, 12, 12);
                    } else if(this.state.plotInfo[this.hit].restype==="GLY"){
                        ctx.drawImage(this.imgGlyOutlier, x-6, y-6, 12, 12);
                    } else {
                        ctx.drawImage(this.imgOtherOutlier, x-6, y-6, 12, 12);
                    }
                } else {
                    if(this.state.plotInfo[this.hit].restype==="PRO"){
                        ctx.drawImage(this.imgProNormal, x-6, y-6, 12, 12);
                    } else if(this.state.plotInfo[this.hit].restype==="GLY"){
                        ctx.drawImage(this.imgGlyNormal, x-6, y-6, 12, 12);
                    } else {
                        ctx.drawImage(this.imgOtherNormal, x-6, y-6, 12, 12);
                    }
                }
            }
        }
        
    }

    fixContext() {
        this.context = this.canvasRef.current.getContext('2d');
        var ctx = this.context;
        this.imageData = ctx.getImageData(0,0,this.canvasRef.current.width, this.canvasRef.current.height);
    }

    handleLoad() {
        this.image = this.imageRef.current;
        this.imgOtherOutlier = this.ramaPlotOtherOutlierImageRef.current;
        this.imgOtherNormal = this.ramaPlotOtherNormalImageRef.current;
        this.imgProOutlier = this.ramaPlotProOutlierImageRef.current;
        this.imgProNormal = this.ramaPlotProNormalImageRef.current;
        this.imgGlyOutlier = this.ramaPlotGlyOutlierImageRef.current;
        this.imgGlyNormal = this.ramaPlotGlyNormalImageRef.current;
        this.draw();
    }

    doMouseMove(event,self) {
        var x;
        var y;
        var e = event;
        if (e.pageX || e.pageY) {
            x = e.pageX;
            y = e.pageY;
        }
        else {
            x = e.clientX ;
            y = e.clientY ;
        }

        var c = this.canvasRef.current;
        var offset = getOffsetRect(c);

        x -= offset.left;
        y -= offset.top;
        
        if(this.state.plotInfo){
            let ihit = -1;
            let mindist = 100000;
            for(let ip=0;ip<this.state.plotInfo.length;ip++){
                let phitest = this.state.plotInfo[ip].phi;
                let psitest = this.state.plotInfo[ip].psi;
                let xp = ((phitest /180.) * 0.5 + 0.5) * c.width;
                let yp = ((-psitest /180.) * 0.5 + 0.5) * c.height;
                if((Math.abs(xp-x)<3)&&(Math.abs(yp-y)<3)){
                    let dist = (xp-x)*(xp-x) + (yp-y)*(yp-y);
                    if(dist<mindist){
                        mindist = dist;
                        ihit = ip;
                    }
                }
            }
            if(ihit>-1){
                this.hit = ihit;
                this.draw();
            }
        }

    }

    componentDidMount() {
        const self = this;
        this.context = this.canvasRef.current.getContext('2d');
        var ctx = this.context;
        this.imageData = ctx.getImageData(0,0,this.canvasRef.current.width, this.canvasRef.current.height);

        const img = new window.Image();
        img.src = "/rama2_all.png";
        img.crossOrigin="Anonymous";
        this.imageRef.current = img;
        this.imageRef.current.addEventListener('load', this.handleLoad.bind(self));

        const imgGlyNormal = new window.Image();
        imgGlyNormal.src = "/rama-plot-gly-normal.png";
        imgGlyNormal.crossOrigin="Anonymous";
        this.ramaPlotGlyNormalImageRef.current = imgGlyNormal;
        this.ramaPlotGlyNormalImageRef.current.addEventListener('load', this.handleLoad.bind(self));

        const imgGlyOutlier = new window.Image();
        imgGlyOutlier.src = "/rama-plot-gly-outlier.png";
        imgGlyOutlier.crossOrigin="Anonymous";
        this.ramaPlotGlyOutlierImageRef.current = imgGlyOutlier;
        this.ramaPlotGlyOutlierImageRef.current.addEventListener('load', this.handleLoad.bind(self));

        const imgProNormal = new window.Image();
        imgProNormal.src = "/rama-plot-pro-normal.png";
        imgProNormal.crossOrigin="Anonymous";
        this.ramaPlotProNormalImageRef.current = imgProNormal;
        this.ramaPlotProNormalImageRef.current.addEventListener('load', this.handleLoad.bind(self));

        const imgProOutlier = new window.Image();
        imgProOutlier.src = "/rama-plot-pro-outlier.png";
        imgProOutlier.crossOrigin="Anonymous";
        this.ramaPlotProOutlierImageRef.current = imgProOutlier;
        this.ramaPlotProOutlierImageRef.current.addEventListener('load', this.handleLoad.bind(self));

        const imgOtherNormal = new window.Image();
        imgOtherNormal.src = "/rama-plot-other-normal.png";
        imgOtherNormal.crossOrigin="Anonymous";
        this.ramaPlotOtherNormalImageRef.current = imgOtherNormal;
        this.ramaPlotOtherNormalImageRef.current.addEventListener('load', this.handleLoad.bind(self));

        const imgOtherOutlier = new window.Image();
        imgOtherOutlier.src = "/rama-plot-other-outlier.png";
        imgOtherOutlier.crossOrigin="Anonymous";
        this.ramaPlotOtherOutlierImageRef.current = imgOtherOutlier;
        this.ramaPlotOtherOutlierImageRef.current.addEventListener('load', this.handleLoad.bind(self));

        self.mouseDown = false;
        this.canvasRef.current.addEventListener("mousemove", function(evt){ self.doMouseMove(evt,self); }, false);
    }

    render() {
        const height = 230;
        const width = 230;
        this.canvas = <canvas height={height} height={height} ref={this.canvasRef} />;  
        return this.canvas;
    }

    constructor(props) {
        super(props);
        this.state = {plotInfo: null};
        this.canvasRef = createRef();
        this.imageRef = createRef();
        this.ramaPlotGlyNormalImageRef = createRef();
        this.ramaPlotGlyOutlierImageRef = createRef();
        this.ramaPlotProNormalImageRef = createRef();
        this.ramaPlotProOutlierImageRef = createRef();
        this.ramaPlotOtherNormalImageRef = createRef();
        this.ramaPlotOtherOutlierImageRef = createRef();
        this.image = null;
        this.ramaPlotGlyNormalImage = null;
        this.ramaPlotGlyOutlierImage = null;
        this.ramaPlotProNormalImage = null;
        this.ramaPlotProOutlierImage = null;
        this.ramaPlotOtherNormalImage = null;
        this.ramaPlotOtherOutlierImage = null;
        this.hit = -1;
    }

    updatePlotData(plotInfo){
        const self = this;
        this.setState({plotInfo:plotInfo},()=>self.draw());
    }
    
}

class Ramachandran extends Component {
    constructor(props) {

        super(props);

        this.ramaRef = createRef();

        this.state = {selected:"unk",log:"", chainId:"", plotInfo: null};
        this.message = "";
        const self = this;
    }

    getDataObjectNamesFromSharedArrayBuffer(buffer){

        const view = new Uint8Array(buffer);
        let buflen = 0;
        for(let i=0;i<buffer.byteLength;i++){
            if(view[i] === 0){
                buflen = i;
                break;
            }
        }
        //console.log(buflen);
        const dec = new TextDecoder();
        const stringified = dec.decode(view.slice(0,buflen));
        const dataObjectNames = JSON.parse(stringified);
        return dataObjectNames;

    }

    handleChange(evt){
        const self = this;
        this.setState({selected:evt.target.value}, ()=> self.getRama());
    }


    handleSubmit(evt){
        evt.preventDefault();
    }

    getRama(){
        const self = this;
        let key = self.state.selected;
        const dataObjectNames = this.getDataObjectNamesFromSharedArrayBuffer(this.props.sharedArrayBuffer);
        const pdbKeys = Object.keys(dataObjectNames.pdbFiles);
        if(pdbKeys.length<1){
            return;
        }
        if(key==="unk"){
            key = pdbKeys[0];
        }
        const jobid = guid();
        const inputData = {method:"get_rama",jobId:jobid,pdbinKey:key,chainId:this.state.chainId};
        self.props.crystWorker.postMessage(inputData);
        console.log(inputData);
        
    }

    updatePlotData(){
        const self = this;
        let key = self.state.selected;
        const dataObjectNames = this.getDataObjectNamesFromSharedArrayBuffer(this.props.sharedArrayBuffer);
        const pdbKeys = Object.keys(dataObjectNames.pdbFiles);
        if(pdbKeys.length<1){
            return;
        }
        if(key==="unk"){
            key = pdbKeys[0];
        }
        self.ramaRef.current.updatePlotData(dataObjectNames.ramaInfo[key]);
        this.setState({plotInfo:dataObjectNames.ramaInfo[key]});
        
    }

    handleChainChange(evt){
        const self = this;
        //TODO - calling getRama should be more sane ?
        this.setState({chainId:evt.target.value}, ()=> self.getRama());
    }

    render () {
        const styles = reactCSS({
            'default': {
                'logpre': {
                     'margin': '10px',
                     'border': '1px solid green',
                     'height': '200px',
                     'overflowX': 'auto',
                     'overflowY': 'scroll',
                },
                'loggraph': {
                     'margin': '10px',
                     'height': '200px',
                     'overflowX': 'auto',
                     'overflowY': 'scroll',
                },
            },
        });

        const self = this;
        const displayData = this.props.displayData;
        const liveUpdatingMaps = this.props.liveUpdatingMaps;

        let rows = [];
        let selected = this.state.selected;
        let handleChange = this.handleChange.bind(self);

        const pdbRegex = /.pdb$/;
        const entRegex = /.ent$/;

        const dataObjectNames = this.getDataObjectNamesFromSharedArrayBuffer(this.props.sharedArrayBuffer);

        const pdbKeys = Object.keys(dataObjectNames.pdbFiles);
        for(let iobj=0;iobj<pdbKeys.length;iobj++){
            const data_id = pdbKeys[iobj];
            const name = dataObjectNames.pdbFiles[data_id].originalFileName;
            const keySup = data_id;
            const keyOption = "rsr_"+keySup;
            const shortName = name.replace(pdbRegex,"");
            rows.push(<option key={keyOption} value={keySup}>{shortName}</option>);
        }

        if(selected==="unk"&&pdbKeys.length>0){
            selected = pdbKeys[0];
        }

        //TODO - Need to introspect the pdb file to see what chains exist and pick the first one ...

        return (
                <>
        <Form onSubmit={this.handleSubmit.bind(this)}>
        <Form.Group as={Row} controlId="rama">
        <Col>
                <Form.Select value={selected} onChange={handleChange} >
                {rows}
                </Form.Select>
        </Col>
        <Col>
        <Form.Control required type="text" onChange={this.handleChainChange.bind(this)} placeholder="Chain id" value={this.state.chainId} />
        </Col>
        </Form.Group>
        </Form>
        <div className="vspace1em"></div>
        <RamaPlot ref={this.ramaRef} />
        </>
        );
    }
}
export default Ramachandran;
