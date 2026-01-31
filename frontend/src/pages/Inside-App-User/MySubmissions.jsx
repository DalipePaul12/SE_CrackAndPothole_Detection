import React from 'react';
import './MySubmissions.css';

//Imports of Sidebar and Header
import Sidebar from '../../components/Sidebar.jsx';
import AppHeader from '../../components/AppHeader.jsx';


function MySubmissions() {
    return (
        <>
        <Sidebar />
        <AppHeader />

        <div className="my-submissions-container">
            <h1>Welcome to the My Submissions Page</h1>
        </div>
        </>
    );  
}

export default MySubmissions;