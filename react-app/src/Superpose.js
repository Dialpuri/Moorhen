import React, { Component, createRef } from 'react';
import reactCSS from 'reactcss'

import Table from 'react-bootstrap/Table';
import Col from 'react-bootstrap/Col';
import Row from 'react-bootstrap/Row';
import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';
import Dropdown from 'react-bootstrap/Dropdown';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';

import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Scatter } from 'react-chartjs-2';

import { guid } from './guid.js';

ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Legend);


class DisplayTable extends Component {
    constructor(props) {

        super(props);

        const options = {
          scales: {
            y: {
              beginAtZero: true,
            },
          },
        };

        const data = {
          datasets: [
            {
              label: 'Consensus RMSD vs. residue number of first structure',
              data: [],
              backgroundColor: 'rgba(255, 99, 132, 1)',
            },
          ],
        };

        this.state = {selected:{ids:{}},log:"",chartData:data,chartOptions:options};
        this.jobData = {};
        this.message = "";
        const self = this;
        this.myWorkerSSM = new window.Worker('wasm/superpose_worker.js');

        this.myWorkerSSM.onmessage = function(e) {
                         let result = document.getElementById("output");
                         if(e.data[0]==="output"){
                             self.message += e.data[1] + "\n";
                             self.setState({log:self.message});
                         //result.innerHTML += e.data[1] + "<br />";
                         }
                         if(e.data[0]==="result"){
                         //This is then where we decide upon the action
                             self.message += e.data[1] + "\n";
                             self.setState({log:self.message});
                         }
                         if(e.data[0]==="csvResult"){
                         const csvResult = e.data[1];
                         const alignData = csvResult["alignData"];
                         const jobid = csvResult["jobid"];
                         console.log(self.jobData[jobid]);
                         const transformMatrices = csvResult["transformMatrices"];
                         console.log(transformMatrices);
                         //TODO - Label depends on whether pairwise of multi.
                         const data = {
                           datasets: [
                             {
                               label: 'Consensus RMSD vs. residue number of first structure',
                               data: alignData,
                               backgroundColor: 'rgba(255, 99, 132, 1)',
                             },
                           ],
                         };

                         self.setState({chartData:data});
                         }
        }
    }

    handleSuperpose(){
        const self = this;
        const dataFiles = self.props.dataFiles.ids;
        const displayData = this.props.displayData;
        let checked = self.state.selected.ids;
        let superposeInputFileData = [];
        let superposeInputFileNames = [];
        const jobid = guid();
        this.jobData[jobid] = [];
        for (const [key, value] of Object.entries(checked)) {
            if(value){
                for(let iobj=0;iobj<displayData.length;iobj++){
                    let data_id = displayData[iobj].id;
                    let name = displayData[iobj].name;
                    if(data_id===key){
                        this.jobData[jobid].push(data_id);
                        superposeInputFileData.push(dataFiles[key].contents);
                        const isPDB = dataFiles[key].isPDB;
                        if(isPDB){
                            superposeInputFileNames.push(name+".pdb");
                        } else {
                            superposeInputFileNames.push(name+".cif");
                        }
                    }
                }
            }
        }
        if(superposeInputFileData.length>1){
            self.myWorkerSSM.postMessage([superposeInputFileData, superposeInputFileNames,jobid]);
        }
    }

    handleCheckChange(data_id, evt){
        const self = this;
        const changedIds = { ...this.state.selected.ids, [data_id] : evt.target.checked };
        const newIds = { ...this.state.selected, ids : changedIds };
        this.setState({selected:newIds});
    }

    render () {
        var self = this;
        const displayData = this.props.displayData;
        let rows = [];
        let modals = [];
        var showModal = this.state.showModal;
        var showAddModal = this.state.showAddModal;

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
            },
        });

        const self = this;
        const displayData = this.props.displayData;
        let rows = [];
        let handleSuperpose = this.handleSuperpose.bind(self);
        for(let iobj=0;iobj<displayData.length;iobj++){
            let data_id = displayData[iobj].id;
            let name = displayData[iobj].name;
            let keySup = "sup_"+data_id;
            rows.push(<tr key={iobj}><td>{name}</td>
            <td key={keySup}><input type="checkbox" onChange={(evt) => this.handleCheckChange(data_id, evt)}/></td>
            </tr>
            );
        }
        const data = this.state.chartData;
        const options = this.state.chartOptions;
        return (
                <>
                <Table responsive>
                <tbody>
                {rows}
                </tbody>
                </Table>
                <Button size="sm" onClick={handleSuperpose}>Superpose</Button>
                <pre style={styles.logpre}>
                {this.state.log}
                </pre>
                <Scatter data={data} options={this.state.chartOptions} />
            </>
        );
    }
}
export default DisplayTable;
