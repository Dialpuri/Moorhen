import React, { useEffect, useCallback, forwardRef, useState, useRef } from 'react';
import { Toast, ToastContainer } from 'react-bootstrap';
import { MGWebGL } from '../WebGLgComponents/mgWebGL.js';
import { MoorhenColourRules } from "./MoorhenColourRules.js"
import { MoorhenContextMenu } from "./MoorhenContextMenu.js"
import { convertViewtoPx } from '../utils/MoorhenUtils.js';

export const MoorhenWebMG = forwardRef((props, glRef) => {
    const scores = useRef({})
    const [mapLineWidth, setMapLineWidth] = useState(0.75)
    const [connectedMolNo, setConnectedMolNo] = useState(null)
    const [scoresToastContents, setScoreToastContents] = useState(null)
    const [showContextMenu, setShowContextMenu] = useState(false)
    const busyGettingAtom = useRef(false)

    const setClipFogByZoom = () => {
        const fieldDepthFront = 8;
        const fieldDepthBack = 21;
        glRef.current.set_fog_range(glRef.current.fogClipOffset - (glRef.current.zoom * fieldDepthFront), glRef.current.fogClipOffset + (glRef.current.zoom * fieldDepthBack))
        glRef.current.set_clip_range(0 - (glRef.current.zoom * fieldDepthFront), 0 + (glRef.current.zoom * fieldDepthBack))
        glRef.current.doDrawClickedAtomLines = false
    }

    const handleZoomChanged = useCallback(e => {
        if (props.preferences.resetClippingFogging) {
            setClipFogByZoom()
        }
    }, [glRef, props.preferences.resetClippingFogging])

    const handleGoToBlobDoubleClick = useCallback(e => {
        props.commandCentre.current.cootCommand({
            returnType: "float_array",
            command: "go_to_blob_array",
            commandArgs: [e.detail.front[0], e.detail.front[1], e.detail.front[2], e.detail.back[0], e.detail.back[1], e.detail.back[2], 0.5]
        }).then(response => {
            let newOrigin = response.data.result.result;
            if (newOrigin.length === 3) {
                glRef.current.setOriginAnimated([-newOrigin[0], -newOrigin[1], -newOrigin[2]])
            }
        })
    }, [props.commandCentre, glRef])

    const handleMiddleClickGoToAtom = useCallback(e => {
        if (props.hoveredAtom?.molecule && props.hoveredAtom?.cid){

            const [molName, insCode, chainId, resInfo, atomName] = props.hoveredAtom.cid.split('/')
            if (!chainId || !resInfo) {
                return
            }
                        
            const resNum = resInfo.split("(")[0]

            props.hoveredAtom.molecule.centreOn(glRef, `/*/${chainId}/${resNum}-${resNum}/*`)
        }
    }, [props.hoveredAtom, glRef])


    const drawHBonds = async () => {
        const visibleMolecules = props.molecules.filter(molecule => molecule.isVisible && molecule.hasVisibleBuffers())
        if (visibleMolecules.length === 0) {
            console.log("returning...",props.molecules)
            return
        }
        busyGettingAtom.current = true
        const response = await props.commandCentre.current.cootCommand({
            returnType: "int_string_pair",
            command: "get_active_atom",
            commandArgs: [...glRef.current.origin.map(coord => coord * -1), visibleMolecules.map(molecule => molecule.molNo).join(':')]
        })
        const moleculeMolNo = response.data.result.result.first
        const residueCid = response.data.result.result.second
        const mol = props.molecules.find(molecule => molecule.molNo === moleculeMolNo)

        if(mol) {
            const cidSplit0 = residueCid.split(" ")[0]
            const cidSplit = cidSplit0.replace(/\/+$/, "").split("/")
            const resnum = cidSplit[cidSplit.length-1]
            const oneCid = cidSplit.join("/")+"-"+resnum
            const sel = new window.CCP4Module.Selection(oneCid)
            const hbonds = await props.commandCentre.current.cootCommand({
                returnType: "vector_hbond",
                command: "get_hbonds",
                commandArgs: [mol.molNo,oneCid]
            })
            const hbs = hbonds.data.result.result
            mol.drawHBonds(glRef,hbs)
        }
        busyGettingAtom.current = false
    }

    const clearHBonds = useCallback(async (e) => {
        if(props.drawInteractions)
            return
        props.molecules.forEach(mol => {
                mol.drawGemmiAtoms(glRef,[],"originNeighbours",[1.0, 0.0, 0.0, 1.0],true,true)
        })
    },[props.drawInteractions,props.molecules])

    const handleOriginUpdate = useCallback(async (e) => {
        if (!busyGettingAtom.current && props.drawInteractions) {
            drawHBonds()
        }
    }, [props.commandCentre,props.drawInteractions,props.molecules])

    useEffect(() => {
        if(props.drawInteractions){
            handleOriginUpdate()
        } else {
            clearHBonds()
        }
    }, [props.drawInteractions,props.molecules])

    useEffect(() => {
        glRef.current.doPerspectiveProjection = props.doPerspectiveProjection
        glRef.current.clearTextPositionBuffers()
        glRef.current.drawScene()
    }, [props.doPerspectiveProjection])

    useEffect(() => {
        glRef.current.useOffScreenBuffers = props.useOffScreenBuffers
        glRef.current.drawScene()
    }, [props.useOffScreenBuffers])

    const handleScoreUpdates = useCallback(async (e) => {
        if (e.detail?.modifiedMolecule !== null && connectedMolNo && connectedMolNo.molecule === e.detail.modifiedMolecule) {
            
            await Promise.all(
                props.maps.filter(map => connectedMolNo.uniqueMaps.includes(map.molNo)).map(map => {
                    return map.doCootContour(glRef,
                        ...glRef.current.origin.map(coord => -coord),
                        map.mapRadius,
                        map.contourLevel)
                })
            )
            
            const currentScores = await props.commandCentre.current.cootCommand({
                returnType: "r_factor_stats",
                command: "get_r_factor_stats",
                commandArgs: [],
            }, true)

            console.log(currentScores.data.timeMainThreadToWorker)
            console.log(currentScores.data.timelibcootAPI)
            console.log(currentScores.data.timeconvertingWASMJS)
            console.log(`Message from worker back to main thread took ${Date.now() - currentScores.data.messageSendTime} ms (get_r_factor_stats) - (${currentScores.data.messageId.slice(0, 5)})`)

            const newToastContents =    <Toast.Body style={{width: '100%'}}>
                                            {props.preferences.defaultUpdatingScores.includes('Rfactor') && 
                                                <p style={{paddingLeft: '0.5rem', marginBottom:'0rem'}}>
                                                    Clipper R-Factor {parseFloat(currentScores.data.result.result.r_factor).toFixed(3)}
                                                </p>
                                            }
                                            {props.preferences.defaultUpdatingScores.includes('Rfree') && 
                                                <p style={{paddingLeft: '0.5rem', marginBottom:'0rem'}}>
                                                    Clipper R-Free {parseFloat(currentScores.data.result.result.free_r_factor).toFixed(3)}
                                                </p>
                                            }
                                            {props.preferences.defaultUpdatingScores.includes('Moorhen Points') && 
                                                <p style={{paddingLeft: '0.5rem', marginBottom:'0rem'}}>
                                                    Moorhen Points {currentScores.data.result.result.rail_points_total}
                                                </p>
                                            }
                                        </Toast.Body>
            
            if (scores !== null) {
                const moorhenPointsDiff = currentScores.data.result.result.rail_points_total - scores.current.moorhenPoints
                const rFactorDiff = currentScores.data.result.result.r_factor - scores.current.rFactor
                const rFreeDiff = currentScores.data.result.result.free_r_factor - scores.current.rFree

                setScoreToastContents(
                        <Toast.Body style={{width: '100%'}}>
                            {props.preferences.defaultUpdatingScores.includes('Rfactor') && 
                                <p style={{paddingLeft: '0.5rem', marginBottom:'0rem', color: rFactorDiff < 0 ? 'green' : 'red'}}>
                                    Clipper R-Factor {parseFloat(scores.current.rFactor).toFixed(3)} {`${rFactorDiff < 0 ? '' : '+'}${parseFloat(rFactorDiff).toFixed(3)}`}
                                </p>
                            }
                            {props.preferences.defaultUpdatingScores.includes('Rfree') && 
                                <p style={{paddingLeft: '0.5rem', marginBottom:'0rem', color: rFreeDiff < 0 ? 'green' : 'red'}}>
                                    Clipper R-Free {parseFloat(scores.current.rFree).toFixed(3)} {`${rFreeDiff < 0 ? '' : '+'}${parseFloat(rFreeDiff).toFixed(3)}`}
                                </p>
                            }
                            {props.preferences.defaultUpdatingScores.includes('Moorhen Points') && 
                                <p style={{paddingLeft: '0.5rem', marginBottom:'0rem', color: moorhenPointsDiff < 0 ? 'red' : 'green'}}>
                                    Moorhen Points {scores.current.moorhenPoints} {`${moorhenPointsDiff < 0 ? '' : '+'}${moorhenPointsDiff}`}
                                </p>
                            }
                        </Toast.Body>
                )

                setTimeout(() => {
                    setScoreToastContents(newToastContents)
                }, 3000);
        
            } else {
                setScoreToastContents(newToastContents)
            }

            scores.current = {
                moorhenPoints: currentScores.data.result.result.rail_points_total,
                rFactor: currentScores.data.result.result.r_factor,
                rFree: currentScores.data.result.result.free_r_factor
            }
        } 

    }, [props.commandCentre, connectedMolNo, scores, props.preferences.defaultUpdatingScores, glRef, props.maps])

    const handleDisconnectMaps = () => {
        scores.current = {}
        const selectedMolecule = props.molecules.find(molecule => molecule.molNo === connectedMolNo.molecule)
        if (selectedMolecule) {
            selectedMolecule.connectedToMaps = null
        }
        setConnectedMolNo(null)
        setScoreToastContents(null)
    }
    
    const handleConnectMaps = useCallback(async (evt) => {
        
        const currentScores = await props.commandCentre.current.cootCommand({
            returnType: "r_factor_stats",
            command: "get_r_factor_stats",
            commandArgs: [],
        }, true)

        setScoreToastContents(
                <Toast.Body style={{width: '100%'}}>
                    {props.preferences.defaultUpdatingScores.includes('Rfactor') && 
                        <p style={{paddingLeft: '0.5rem', marginBottom:'0rem'}}>
                            Clipper R-Factor {parseFloat(currentScores.data.result.result.r_factor).toFixed(3)}
                        </p>
                    }
                    {props.preferences.defaultUpdatingScores.includes('Rfree') && 
                        <p style={{paddingLeft: '0.5rem', marginBottom:'0rem'}}>
                            Clipper R-Free {parseFloat(currentScores.data.result.result.free_r_factor).toFixed(3)}
                        </p>
                    }
                    {props.preferences.defaultUpdatingScores.includes('Moorhen Points') && 
                        <p style={{paddingLeft: '0.5rem', marginBottom:'0rem'}}>
                            Moorhen Points {currentScores.data.result.result.rail_points_total}
                        </p>
                    }
                </Toast.Body>
        )
        
        scores.current = {
            moorhenPoints: currentScores.data.result.result.rail_points_total,
            rFactor: currentScores.data.result.result.r_factor,
            rFree: currentScores.data.result.result.free_r_factor
        }

        if (connectedMolNo && evt.detail.molecule !== connectedMolNo.molecule) {
            const previousConnectedMolecule = props.molecules.find(molecule => molecule.molNo === connectedMolNo.molecule)
            previousConnectedMolecule.connectedToMaps = null    
        }

        setConnectedMolNo(evt.detail)
        const selectedMolecule = props.molecules.find(molecule => molecule.molNo === evt.detail.molecule)
        selectedMolecule.connectedToMaps = evt.detail.maps
        
    }, [props.commandCentre, props.preferences.defaultUpdatingScores, props.molecules, connectedMolNo])

    useEffect(() => {
        if (scores.current !== null && props.preferences.defaultUpdatingScores !== null && props.preferences.showScoresToast && connectedMolNo) {
            setScoreToastContents(
                <Toast.Body style={{width: '100%'}}>
                    {props.preferences.defaultUpdatingScores.includes('Rfactor') && 
                        <p style={{paddingLeft: '0.5rem', marginBottom:'0rem'}}>
                            Clipper R-Factor {parseFloat(scores.current.rFactor).toFixed(3)}
                        </p>
                    }
                    {props.preferences.defaultUpdatingScores.includes('Rfree') && 
                        <p style={{paddingLeft: '0.5rem', marginBottom:'0rem'}}>
                            Clipper R-Free {parseFloat(scores.current.rFree).toFixed(3)}
                        </p>
                    }
                    {props.preferences.defaultUpdatingScores.includes('Moorhen Points') && 
                        <p style={{paddingLeft: '0.5rem', marginBottom:'0rem'}}>
                            Moorhen Points {scores.current.moorhenPoints}
                        </p>
                    }
                </Toast.Body>
            )
        }

    }, [props.preferences.defaultUpdatingScores, props.preferences.showScoresToast]);

    const handleWindowResized = useCallback((e) => {
        glRef.current.setAmbientLightNoUpdate(0.2, 0.2, 0.2)
        glRef.current.setSpecularLightNoUpdate(0.6, 0.6, 0.6)
        glRef.current.setDiffuseLight(1., 1., 1.)
        glRef.current.setLightPositionNoUpdate(10., 10., 60.)
        if (props.preferences.resetClippingFogging) {
            setClipFogByZoom()
        }
        glRef.current.resize(props.width(), props.height())
        glRef.current.drawScene()
    }, [glRef, props.width, props.height])

    const handleRightClick = useCallback((e) => {
        setShowContextMenu({ ...e.detail })
    }, [])

    useEffect(() => {
        glRef.current.setAmbientLightNoUpdate(0.2, 0.2, 0.2)
        glRef.current.setSpecularLightNoUpdate(0.6, 0.6, 0.6)
        glRef.current.setDiffuseLight(1., 1., 1.)
        glRef.current.setLightPositionNoUpdate(10., 10., 60.)
        setClipFogByZoom()
        glRef.current.resize(props.width(), props.height())
        glRef.current.drawScene()
    }, [])

    useEffect(() => {
        document.addEventListener("connectMaps", handleConnectMaps);
        return () => {
            document.removeEventListener("connectMaps", handleConnectMaps);
        };

    }, [handleConnectMaps]);

    useEffect(() => {
        document.addEventListener("scoresUpdate", handleScoreUpdates);
        return () => {
            document.removeEventListener("scoresUpdate", handleScoreUpdates);
        };

    }, [handleScoreUpdates]);

    useEffect(() => {
        document.addEventListener("originUpdate", handleOriginUpdate);
        return () => {
            document.removeEventListener("originUpdate", handleOriginUpdate);
        };

    }, [handleOriginUpdate]);

    useEffect(() => {
        document.addEventListener("goToBlobDoubleClick", handleGoToBlobDoubleClick);
        return () => {
            document.removeEventListener("goToBlobDoubleClick", handleGoToBlobDoubleClick);
        };

    }, [handleGoToBlobDoubleClick]);

    useEffect(() => {
        document.addEventListener("zoomChanged", handleZoomChanged);
        return () => {
            document.removeEventListener("zoomChanged", handleZoomChanged);
        };
    }, [handleZoomChanged]);

    useEffect(() => {
        document.addEventListener("goToAtomMiddleClick", handleMiddleClickGoToAtom);
        return () => {
            document.removeEventListener("goToAtomMiddleClick", handleMiddleClickGoToAtom);
        };

    }, [handleMiddleClickGoToAtom]);

    useEffect(() => {
        window.addEventListener('resize', handleWindowResized)
        return () => {
            window.removeEventListener('resize', handleWindowResized)
        }
    }, [handleWindowResized])

    useEffect(() => {
        document.addEventListener("rightClick", handleRightClick);
        return () => {
            document.removeEventListener("rightClick", handleRightClick);
        };

    }, [handleRightClick]);

    useEffect(() => {
        if (glRef.current) {
            glRef.current.clipCapPerfectSpheres = props.clipCap
            glRef.current.drawScene()
        }
    }, [
        props.clipCap,
        glRef.current
    ])

    useEffect(() => {
        if (glRef.current) {
            glRef.current.background_colour = props.backgroundColor
            glRef.current.drawScene()
        }
    }, [
        props.backgroundColor,
        glRef.current
    ])

    useEffect(() => {
        if (glRef.current) {
            glRef.current.atomLabelDepthMode = props.atomLabelDepthMode
            glRef.current.drawScene()
        }
    }, [
        props.atomLabelDepthMode,
        glRef.current
    ])

    useEffect(() => {
        if (props.preferences.mapLineWidth !== mapLineWidth){
            setMapLineWidth(props.preferences.mapLineWidth)
        }
    }, [props.preferences])

    useEffect(() => {
        if (connectedMolNo && props.molecules.length === 0){
            handleDisconnectMaps()
        } else if (connectedMolNo && !props.molecules.map(molecule => molecule.molNo).includes(connectedMolNo.molecule)){
            handleDisconnectMaps()
        }
    }, [props.molecules])

    useEffect(() => {
        const mapsMolNo = props.maps.map(map => map.molNo)
        if (connectedMolNo && mapsMolNo === 0){
            handleDisconnectMaps()
        } else if (connectedMolNo && !connectedMolNo.uniqueMaps.every(mapMolNo => mapsMolNo.includes(mapMolNo))){
            handleDisconnectMaps()
        }
        props.maps.forEach(map => {
            if (map.webMGContour) {
                map.contour(glRef.current)
            }
        })
    }, [props.maps, props.maps.length])

    /*
    if(window.pyodide){
        window.xxx = 42
        window.yyy = [2,21,84]
        window.zzz = {"foo":"bar","sna":"foo"}
        window.zzz.fu = "kung"
        window.pyodide.runPython(`
        from js import window
        zzz = window.zzz
        zzz_py = zzz.to_py()
        print("hello !!!!!!!!!!!!!!!!!!!!!!",window.xxx,window.yyy,len(window.yyy))
        for k,v in zzz_py.items():
            print(k,v)
        `)
    }
    */
    return  <>
                <ToastContainer style={{ zIndex: '0', marginTop: "5rem", marginLeft: '0.5rem', textAlign:'left', alignItems: 'left', maxWidth: convertViewtoPx(40, props.windowWidth)}} position='top-start' >
                    {scoresToastContents !== null && props.preferences.showScoresToast &&
                        <Toast onClose={() => {}} autohide={false} show={true} style={{width: '100%'}}>
                            {scoresToastContents}
                        </Toast>
                    }
                    <MoorhenColourRules glRef={glRef} {...props}/>
                </ToastContainer>
               
                <MGWebGL
                    ref={glRef}
                    dataChanged={(d) => { console.log(d) }}
                    onAtomHovered={props.onAtomHovered}
                    onKeyPress={props.onKeyPress}
                    messageChanged={() => { }}
                    mouseSensitivityFactor={props.preferences.mouseSensitivity}
                    wheelSensitivityFactor={props.preferences.wheelSensitivityFactor}
                    keyboardAccelerators={JSON.parse(props.preferences.shortCuts)}
                    showCrosshairs={props.preferences.drawCrosshairs}
                    showFPS={props.preferences.drawFPS}
                    mapLineWidth={mapLineWidth}
                    drawMissingLoops={props.drawMissingLoops}
                    drawInteractions={props.drawInteractions} />

                {showContextMenu &&
                <MoorhenContextMenu 
                    glRef={glRef}
                    viewOnly={props.viewOnly}
                    urlPrefix={props.urlPrefix}
                    commandCentre={props.commandCentre}
                    backgroundColor={props.backgroundColor}
                    setBackgroundColor={props.setBackgroundColor}
                    isDark={props.isDark}
                    timeCapsuleRef={props.timeCapsuleRef}
                    molecules={props.molecules}
                    changeMolecules={props.changeMolecules}
                    maps={props.maps}
                    changeMaps={props.changeMaps}
                    showContextMenu={showContextMenu}
                    setShowContextMenu={setShowContextMenu}
                    activeMap={props.activeMap}
                    refineAfterMod={props.preferences.refineAfterMod}
                    shortCuts={props.preferences.shortCuts}
                    enableTimeCapsule={props.preferences.enableTimeCapsule}
                    windowWidth={props.windowWidth}
                    windowHeight={props.windowHeight}
                />}
            </>
});


