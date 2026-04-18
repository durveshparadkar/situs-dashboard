import { TrendingUp } from "lucide-react"

export default function ForecastCard() {
  return (

    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md transition">

      {/* Header */}

      <div className="flex items-center justify-between mb-4">

        <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">
          Revenue Forecast
        </h3>

        <div className="bg-emerald-50 text-emerald-600 p-2 rounded-lg">
          <TrendingUp size={16} />
        </div>

      </div>

      {/* Forecast Value */}

      <div className="space-y-1">

        <div className="text-3xl font-semibold text-slate-900">
          $3.2M
        </div>

        <p className="text-sm text-slate-500">
          Likely revenue this quarter
        </p>

      </div>

      {/* Footer Metrics */}

      <div className="mt-5 pt-4 border-t border-slate-100 flex justify-between text-sm">

        <div>
          <p className="text-slate-400">Confidence</p>
          <p className="font-medium text-slate-900">82%</p>
        </div>

        <div>
          <p className="text-slate-400">Deals</p>
          <p className="font-medium text-slate-900">14</p>
        </div>

      </div>

    </div>

  )
}