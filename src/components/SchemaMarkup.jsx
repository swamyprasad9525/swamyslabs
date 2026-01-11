import React from 'react';
import { Helmet } from 'react-helmet-async';

const SchemaMarkup = () => {
    const schemaData = {
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        "name": "Swamy Slabs",
        "image": "https://swamyslabs.com/ssi_logo.png", // Assuming this is the logo path
        "description": "Premium Indian Limestone Exporter and Stone Calibration Services. Specializing in Tandur Yellow Sandstone and Granite processing.",
        "address": {
            "@type": "PostalAddress",
            "streetAddress": "Sy. No. 248, T. Gokulapadu",
            "addressLocality": "Tandur",
            "addressRegion": "Telangana",
            "postalCode": "501141",
            "addressCountry": "IN"
        },
        "geo": {
            "@type": "GeoCoordinates",
            "latitude": "17.2575", // Approximate coords for Tandur, update with exact
            "longitude": "77.5885"
        },
        "url": "https://swamyslabs.com",
        "telephone": "+919989666999", // Replace with actual phone if different
        "priceRange": "$$",
        "foundingDate": "1994", // 30 year legacy
        "areaServed": "Global",
        "knowsAbout": ["Indian Limestone", "Natural Stone", "Granite", "Stone Calibration"],
        "sameAs": [
            // Add social medial links here if available
        ]
    };

    return (
        <Helmet>
            <script type="application/ld+json">
                {JSON.stringify(schemaData)}
            </script>
        </Helmet>
    );
};

export default SchemaMarkup;
