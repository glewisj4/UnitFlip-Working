import React from 'react';
import { Room, CatalogItem } from '../core/models/types';
import { ChefHat, Bath, Sofa, Bed, Home, Briefcase, Box, ArrowRight, Plus, Plug, DollarSign, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { PhotoCapture } from './PhotoCapture';
import { useAppContext } from '../core/hooks/useAppContext';

interface DashboardProps {
  rooms: Room[];
  products: CatalogItem[];
  onSelectRoom: (roomId: string) => void;
  onAddRoom: () => void;
}

const IconMap: Record<string, any> = {
  ChefHat, Bath, Sofa, Bed, Home, Briefcase, Box, Plug
};

export const Dashboard: React.FC<DashboardProps> = ({ rooms, products, onSelectRoom, onAddRoom }) => {
  const { flags } = useAppContext();
  const getProductCount = (roomId: string) => products.filter(p => p.roomId === roomId).length;
  
  const getRoomFinancials = (roomId: string) => {
    const roomProducts = products.filter(p => p.roomId === roomId);
    // Calculate total cost considering quantity
    const actual = roomProducts.reduce((sum, p) => sum + ((p.actualCost || 0) * (p.quantity || 1)), 0);
    return actual;
  };

  const totalBudget = rooms.reduce((sum, r) => sum + (r.budget || 0), 0);
  const totalActual = rooms.reduce((sum, r) => sum + getRoomFinancials(r.id), 0);
  const totalVariance = totalBudget - totalActual;
  const varianceColor = totalVariance >= 0 ? 'text-green-600' : 'text-red-600';
  const VarianceIcon = totalVariance >= 0 ? TrendingUp : TrendingDown;

  return (
    <div>
      <div className="mb-8">
         <h1 className="text-3xl font-bold text-slate-900 mb-2">Property Database</h1>
         <p className="text-slate-500 text-lg">Flip Overview & Financials</p>
      </div>

      {/* Financial Overview Card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-8 grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-50 rounded-lg text-blue-600">
                <DollarSign size={24} />
            </div>
            <div>
                <p className="text-sm text-slate-500 font-medium uppercase">Total Budget</p>
                <p className="text-2xl font-bold text-slate-900">${totalBudget.toLocaleString()}</p>
            </div>
        </div>
        <div className="flex items-center gap-4">
            <div className="p-3 bg-slate-100 rounded-lg text-slate-600">
                <AlertCircle size={24} />
            </div>
            <div>
                <p className="text-sm text-slate-500 font-medium uppercase">Actual Cost</p>
                <p className="text-2xl font-bold text-slate-900">${totalActual.toLocaleString()}</p>
            </div>
        </div>
        <div className="flex items-center gap-4">
            <div className={`p-3 rounded-lg ${totalVariance >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                <VarianceIcon size={24} />
            </div>
            <div>
                <p className="text-sm text-slate-500 font-medium uppercase">Variance</p>
                <p className={`text-2xl font-bold ${varianceColor}`}>${totalVariance.toLocaleString()}</p>
            </div>
        </div>
      </div>

      <h2 className="text-xl font-bold text-slate-800 mb-4">Areas & Rooms</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {rooms.map((room) => {
          const Icon = IconMap[room.icon] || Box;
          const count = getProductCount(room.id);
          const actualCost = getRoomFinancials(room.id);
          const variance = (room.budget || 0) - actualCost;
          const pctUsed = room.budget > 0 ? (actualCost / room.budget) * 100 : 0;

          return (
            <div 
              key={room.id}
              onClick={() => onSelectRoom(room.id)}
              className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-lowes-blue/50 transition-all cursor-pointer group relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Icon size={80} className="text-lowes-blue transform rotate-12" />
              </div>

              <div className="flex items-start justify-between mb-4 relative z-10">
                <div className="w-12 h-12 bg-blue-50 text-lowes-blue rounded-xl flex items-center justify-center">
                  <Icon size={24} />
                </div>
                <div className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-1 rounded-md h-fit">
                    {count} Items
                </div>
              </div>

              <div className="relative z-10">
                <h3 className="text-xl font-bold text-slate-800 mb-1">{room.name}</h3>
                <p className="text-sm text-slate-500 mb-4 line-clamp-1">{room.description}</p>
                
                {/* Mini Financial Bar */}
                <div className="space-y-2 mb-4">
                   <div className="flex justify-between text-xs font-medium">
                      <span className="text-slate-500">Budget: ${room.budget?.toLocaleString() || 0}</span>
                      <span className={variance >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {variance >= 0 ? '+' : ''}{variance.toLocaleString()}
                      </span>
                   </div>
                   <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${variance >= 0 ? 'bg-lowes-blue' : 'bg-red-500'}`} 
                        style={{ width: `${Math.min(pctUsed, 100)}%` }}
                      ></div>
                   </div>
                   <div className="text-right text-xs text-slate-400">
                     Spent: ${actualCost.toLocaleString()}
                   </div>
                </div>

                <div className="flex items-center justify-end pt-2 border-t border-slate-100">
                    <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-lowes-blue group-hover:text-white transition-colors">
                        <ArrowRight size={16} />
                    </div>
                </div>
              </div>
            </div>
          );
        })}
        
        {/* Add Room Button */}
        <button 
          onClick={onAddRoom}
          className="bg-slate-50 p-6 rounded-2xl border-2 border-dashed border-slate-300 hover:border-lowes-blue hover:bg-white transition-all flex flex-col items-center justify-center text-slate-400 hover:text-lowes-blue gap-3 min-h-[240px]"
        >
          <div className="w-12 h-12 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm">
            <Plus size={24} />
          </div>
          <span className="font-semibold">Add New Room</span>
        </button>
      </div>

      {/* MVP Photo Capture Test - Guarded by flag */}
      {flags?.offline_mode && (
        <PhotoCapture />
      )}
    </div>
  );
};
