import React from 'react';
import { Helmet } from 'react-helmet-async';

const SchemaMarkup = () => {
    const localBusinessSchema = {
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        "@id": "https://swamyslabs.com/#business",
        "name": "Swamy Slabs International",
        "alternateName": "Swamy Slabs",
        "image": "https://swamyslabs.com/ssi_logo.png",
        "logo": "https://swamyslabs.com/ssi_logo.png",
        "description": "Premium Indian Limestone Exporter and Stone Calibration Services. Specializing in Tandur Yellow Sandstone, Kadappa Black Limestone, and Granite processing in Betamcherla, Kurnool, Andhra Pradesh.",
        "url": "https://swamyslabs.com",
        "telephone": "+919381260584",
        "email": "kolliswami784@gmail.com",
        "priceRange": "₹₹",
        "currenciesAccepted": "INR, USD",
        "paymentAccepted": "Bank Transfer, UPI",
        "address": {
            "@type": "PostalAddress",
            "streetAddress": "Kurnool Road, 31",
            "addressLocality": "Betamcherla",
            "addressRegion": "Andhra Pradesh",
            "postalCode": "518599",
            "addressCountry": "IN"
        },
        "geo": {
            "@type": "GeoCoordinates",
            "latitude": "15.3986",
            "longitude": "78.0430"
        },
        "openingHoursSpecification": [
            {
                "@type": "OpeningHoursSpecification",
                "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
                "opens": "09:00",
                "closes": "18:00"
            }
        ],
        "areaServed": {
            "@type": "GeoCircle",
            "geoMidpoint": {
                "@type": "GeoCoordinates",
                "latitude": "15.3986",
                "longitude": "78.0430"
            },
            "geoRadius": "25000"
        },
        "knowsAbout": [
            "Indian Limestone Export",
            "Tandur Yellow Limestone",
            "Kadappa Black Limestone",
            "Natural Stone Processing",
            "Stone Calibration Services",
            "Granite Slabs",
            "Sandstone Tiles",
            "Pool Coping Stones",
            "Cobblestone Supply"
        ],
        "hasOfferCatalog": {
            "@type": "OfferCatalog",
            "name": "Natural Stone Products",
            "itemListElement": [
                {
                    "@type": "Offer",
                    "itemOffered": {
                        "@type": "Product",
                        "name": "Tandur Yellow Limestone",
                        "description": "Premium Indian Tandur Yellow Limestone slabs and cobbles for paving and cladding"
                    }
                },
                {
                    "@type": "Offer",
                    "itemOffered": {
                        "@type": "Product",
                        "name": "Kadappa Black Limestone",
                        "description": "Classic Kadappa Black Limestone for flooring and wall cladding"
                    }
                },
                {
                    "@type": "Offer",
                    "itemOffered": {
                        "@type": "Product",
                        "name": "Napa Slabs",
                        "description": "Large structural natural stone slabs for landscaping and architecture"
                    }
                }
            ]
        },
        "sameAs": [
            "https://www.facebook.com/swamyslabs",
            "https://www.instagram.com/swamyslabs"
        ]
    };

    const organizationSchema = {
        "@context": "https://schema.org",
        "@type": "Organization",
        "@id": "https://swamyslabs.com/#organization",
        "name": "Swamy Slabs International",
        "url": "https://swamyslabs.com",
        "logo": {
            "@type": "ImageObject",
            "url": "https://swamyslabs.com/ssi_logo.png",
            "width": 200,
            "height": 60
        },
        "contactPoint": {
            "@type": "ContactPoint",
            "telephone": "+919381260584",
            "contactType": "sales",
            "email": "kolliswami784@gmail.com",
            "areaServed": "IN",
            "availableLanguage": ["English", "Telugu", "Hindi"]
        }
    };

    return (
        <Helmet>
            <script type="application/ld+json">
                {JSON.stringify(localBusinessSchema)}
            </script>
            <script type="application/ld+json">
                {JSON.stringify(organizationSchema)}
            </script>
        </Helmet>
    );
};

export default SchemaMarkup;
