import React from 'react';
import { Helmet } from 'react-helmet-async';

const SchemaMarkup = () => {
    const localBusinessSchema = {
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        "@id": "https://swamyslabs.vercel.app/#business",
        "name": "Swamy Slabs International",
        "alternateName": "Swamy Slabs",
        "image": "https://swamyslabs.vercel.app/ssi_logo.png",
        "logo": "https://swamyslabs.vercel.app/ssi_logo.png",
        "description": "Premium Indian Limestone Exporter and Stone Calibration Services. Specializing in Tandur Yellow Sandstone, Kadappa Black Limestone, and Granite processing in Betamcherla, Kurnool, Andhra Pradesh.",
        "url": "https://swamyslabs.vercel.app",
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
                    "priceCurrency": "INR",
                    "price": "35.00",
                    "priceSpecification": {
                        "@type": "UnitPriceSpecification",
                        "price": "35.00",
                        "priceCurrency": "INR",
                        "referenceQuantity": {
                            "@type": "QuantitativeValue",
                            "value": "1",
                            "unitCode": "SQFT"
                        }
                    },
                    "availability": "https://schema.org/InStock",
                    "itemOffered": {
                        "@type": "Product",
                        "name": "Tandur Yellow Limestone",
                        "description": "Premium Indian Tandur Yellow Limestone slabs and cobbles for paving and cladding",
                        "image": "https://swamyslabs.vercel.app/tandur-yellow-limestone-french-opus.png",
                        "offers": {
                            "@type": "Offer",
                            "priceCurrency": "INR",
                            "price": "35.00",
                            "priceSpecification": {
                                "@type": "UnitPriceSpecification",
                                "price": "35.00",
                                "priceCurrency": "INR",
                                "referenceQuantity": {
                                    "@type": "QuantitativeValue",
                                    "value": "1",
                                    "unitCode": "SQFT"
                                }
                            },
                            "availability": "https://schema.org/InStock",
                            "url": "https://swamyslabs.vercel.app/#products"
                        }
                    }
                },
                {
                    "@type": "Offer",
                    "priceCurrency": "INR",
                    "price": "30.00",
                    "priceSpecification": {
                        "@type": "UnitPriceSpecification",
                        "price": "30.00",
                        "priceCurrency": "INR",
                        "referenceQuantity": {
                            "@type": "QuantitativeValue",
                            "value": "1",
                            "unitCode": "SQFT"
                        }
                    },
                    "availability": "https://schema.org/InStock",
                    "itemOffered": {
                        "@type": "Product",
                        "name": "Kadappa Black Limestone",
                        "description": "Classic Kadappa Black Limestone for flooring and wall cladding",
                        "image": "https://swamyslabs.vercel.app/kadappa-black-limestone-french-opus.png",
                        "offers": {
                            "@type": "Offer",
                            "priceCurrency": "INR",
                            "price": "30.00",
                            "priceSpecification": {
                                "@type": "UnitPriceSpecification",
                                "price": "30.00",
                                "priceCurrency": "INR",
                                "referenceQuantity": {
                                    "@type": "QuantitativeValue",
                                    "value": "1",
                                    "unitCode": "SQFT"
                                }
                            },
                            "availability": "https://schema.org/InStock",
                            "url": "https://swamyslabs.vercel.app/#products"
                        }
                    }
                },
                {
                    "@type": "Offer",
                    "priceCurrency": "INR",
                    "price": "52.00",
                    "priceSpecification": {
                        "@type": "UnitPriceSpecification",
                        "price": "52.00",
                        "priceCurrency": "INR",
                        "referenceQuantity": {
                            "@type": "QuantitativeValue",
                            "value": "1",
                            "unitCode": "SQFT"
                        }
                    },
                    "availability": "https://schema.org/InStock",
                    "itemOffered": {
                        "@type": "Product",
                        "name": "Napa Slabs",
                        "description": "Large structural natural stone slabs for landscaping and architecture",
                        "image": "https://swamyslabs.vercel.app/napa-slabs-tumbled.png",
                        "offers": {
                            "@type": "Offer",
                            "priceCurrency": "INR",
                            "price": "52.00",
                            "priceSpecification": {
                                "@type": "UnitPriceSpecification",
                                "price": "52.00",
                                "priceCurrency": "INR",
                                "referenceQuantity": {
                                    "@type": "QuantitativeValue",
                                    "value": "1",
                                    "unitCode": "SQFT"
                                }
                            },
                            "availability": "https://schema.org/InStock",
                            "url": "https://swamyslabs.vercel.app/#products"
                        }
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
        "@id": "https://swamyslabs.vercel.app/#organization",
        "name": "Swamy Slabs International",
        "url": "https://swamyslabs.vercel.app",
        "logo": {
            "@type": "ImageObject",
            "url": "https://swamyslabs.vercel.app/ssi_logo.png",
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
