import React from 'react';
import { useNavigate } from 'react-router-dom';

const ProductSuggestions = ({ currentProductId, products = [] }) => {
    const navigate = useNavigate();

    // Get 3 random products excluding current one
    const suggestions = React.useMemo(() => {
        const otherProducts = products.filter(p => p.id !== currentProductId && p._id !== currentProductId);
        return otherProducts.sort(() => 0.5 - Math.random()).slice(0, 3);
    }, [currentProductId, products]);

    if (suggestions.length === 0) return null;

    return (
        <section className="py-20 bg-stone-50 border-t border-stone-200">
            <div className="container mx-auto px-4">
                <div className="text-center mb-12">
                    <h3 className="text-3xl font-serif text-stone-900 mb-2">You Might Also Like</h3>
                    <div className="w-16 h-0.5 bg-stone-400 mx-auto"></div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {suggestions.map((product) => (
                        <div
                            key={product.id || product._id}
                            onClick={() => {
                                navigate(`/collection/${product.id || product._id}`);
                                window.scrollTo(0, 0);
                            }}
                            className="bg-white group cursor-pointer rounded-lg overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300"
                        >
                            <div className="aspect-[4/3] overflow-hidden bg-stone-200 relative">
                                <img
                                    src={product.images[0]}
                                    alt={product.name}
                                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                            </div>
                            <div className="p-6">
                                <h4 className="text-lg font-bold text-stone-900 mb-2 group-hover:text-stone-600 transition">{product.name}</h4>
                                <p className="text-sm text-stone-500 line-clamp-2 mb-4">{product.description}</p>
                                <div className="flex justify-between items-center text-sm font-medium">
                                    <span className="text-stone-900">₹{product.pricePerSqFt}/sq.ft</span>
                                    <span className="text-stone-400 uppercase tracking-wider text-xs">View Details</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default ProductSuggestions;
