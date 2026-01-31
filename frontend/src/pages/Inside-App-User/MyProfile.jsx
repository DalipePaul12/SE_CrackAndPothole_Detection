import React from 'react';
import './MyProfile.css';

//Imports of Sidebar and Header
import Sidebar from '../../components/Sidebar.jsx';
import AppHeader from '../../components/AppHeader.jsx';


function MyProfile() {
    return (
        <>
        <Sidebar />
        <AppHeader />

        <div className="myprofile-container">
            <h1>Welcome to the My Profile Page</h1>
        </div>
        </>
    );  
}

export default MyProfile;