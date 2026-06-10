'use client'

interface Props {
  onClick: () => void
}

export function OnboardingIcon({ onClick }: Props) {
  return (
    <button
      onClick={onClick}
      title="Ver dicas desta página"
      className="hidden md:flex fixed right-5 bottom-5 z-30
        bg-white border border-gray-200
        rounded-full shadow-md
        w-10 h-10
        items-center justify-center
        text-orange-500 hover:text-orange-600
        hover:bg-orange-50
        transition-all duration-200
        hover:scale-105
        group">
      <span className="text-base font-bold select-none">?</span>
      <span className="
        absolute right-full mr-2 bottom-1/2 translate-y-1/2 whitespace-nowrap
        bg-gray-800 text-white text-xs px-2 py-1 rounded-lg
        opacity-0 group-hover:opacity-100
        transition-opacity pointer-events-none
        shadow-lg
      ">
        Dicas desta página
      </span>
    </button>
  )
}
