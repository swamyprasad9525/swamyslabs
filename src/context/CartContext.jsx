import React, { createContext, useContext, useState, useEffect } from 'react';

const CartContext = createContext({
    cartItems: [],
    addToCart: () => { },
    removeFromCart: () => { },
    updateQuantity: () => { },
    clearCart: () => { },
    toggleCart: () => { },
    isCartOpen: false,
    setIsCartOpen: () => { },
    cartCount: 0,
    cartTotal: 0
});

export const useCart = () => useContext(CartContext);

export const CartProvider = ({ children }) => {
    // Load initial cart from local storage
    const [cartItems, setCartItems] = useState(() => {
        try {
            const localData = localStorage.getItem('cart');
            return localData ? JSON.parse(localData) : [];
        } catch (e) {
            console.error("Failed to load cart from local storage", e);
            return [];
        }
    });

    const [isCartOpen, setIsCartOpen] = useState(false);

    // Save to local storage whenever cart changes
    useEffect(() => {
        localStorage.setItem('cart', JSON.stringify(cartItems));
    }, [cartItems]);

    const addToCart = (product) => {
        setCartItems(prevItems => {
            const existingItem = prevItems.find(item => item.id === product.id);
            if (existingItem) {
                return prevItems.map(item =>
                    item.id === product.id
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                );
            }
            return [...prevItems, { ...product, quantity: 1 }];
        });
        setIsCartOpen(true); // Open cart when item is added
    };

    const removeFromCart = (productId) => {
        setCartItems(prevItems => prevItems.filter(item => item.id !== productId));
    };

    const updateQuantity = (productId, newQuantity) => {
        if (newQuantity < 1) {
            removeFromCart(productId);
            return;
        }
        setCartItems(prevItems =>
            prevItems.map(item =>
                item.id === productId
                    ? { ...item, quantity: newQuantity }
                    : item
            )
        );
    };

    const clearCart = () => {
        setCartItems([]);
    };

    const toggleCart = () => setIsCartOpen(prev => !prev);

    const cartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

    // Multi-format price handling
    const cartTotal = cartItems.reduce((acc, item) => {
        let price = 0;
        if (typeof item.price === 'number') {
            price = item.price;
        } else if (typeof item.price === 'string') {
            price = parseFloat(item.price.replace(/[^0-9.]/g, '')) || 0;
        }
        return acc + (price * item.quantity);
    }, 0);

    return (
        <CartContext.Provider value={{
            cartItems,
            isCartOpen,
            addToCart,
            removeFromCart,
            updateQuantity,
            clearCart,
            toggleCart,
            setIsCartOpen,
            cartCount,
            cartTotal
        }}>
            {children}
        </CartContext.Provider>
    );
};
