import React from 'react';
import './Notifications.css';

//Imports of Sidebar and Header
import Sidebar from '../../components/Sidebar.jsx';
import AppHeader from '../../components/AppHeader.jsx';


function Notifications() {
    return (
        <>
        <Sidebar />
        <AppHeader />

        <div className="notifications-container">
            <h1>Welcome to the Notifications Page</h1>
        </div>
        </>
    );  
}

export default Notifications;