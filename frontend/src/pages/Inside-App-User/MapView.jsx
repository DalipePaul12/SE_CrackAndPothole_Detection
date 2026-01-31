import React from 'react';
import './MapView.css';

//Imports of Sidebar and Header
import Sidebar from '../../components/Sidebar.jsx';
import AppHeader from '../../components/AppHeader.jsx';


function MapView() {
    return (
        <>
        <Sidebar />
        <AppHeader />

        <div className="mapview-container">
            <h1>Welcome to the Map View Page</h1>
        </div>
        </>
    );  
}

export default MapView;