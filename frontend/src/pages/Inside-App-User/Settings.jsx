import React from 'react';
import './Settings.css';

//Imports of Sidebar and Header
import Sidebar from '../../components/Sidebar.jsx';
import AppHeader from '../../components/AppHeader.jsx';


function Settings() {
    return (
        <>
        <Sidebar />
        <AppHeader />

        <div className="settings-container">
            <h1>Welcome to the Settings Page</h1>
        </div>
        </>
    );  
}

export default Settings;