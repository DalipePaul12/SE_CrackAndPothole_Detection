import React from 'react';
import './Dashboard.css';

//Imports of Sidebar and Header
import Sidebar from '../../components/Sidebar.jsx';
import AppHeader from '../../components/AppHeader.jsx';


function Dashboard() {
    return (
        <>
        <Sidebar />
        <AppHeader />

        <div className="dashboard-container">
            <h1>Welcome to the Dashboard</h1>
        </div>
        </>
    );  
}

export default Dashboard;