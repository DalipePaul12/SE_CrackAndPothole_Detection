import React from 'react';
import './AllReports.css';

//Imports of Sidebar and Header
import Sidebar from '../../components/Sidebar.jsx';
import AppHeader from '../../components/AppHeader.jsx';


function AllReports() {
    return (
        <>
        <Sidebar />
        <AppHeader />

        <div className="reports-container">
            <h1>Welcome to the Reports Page</h1>
        </div>
        </>
    );  
}

export default AllReports;