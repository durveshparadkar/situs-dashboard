import CommandSearch from "../header/command-search";
import { Bell } from "lucide-react";

export default function Header() {
  return (
    <header className="h-16 flex items-center px-6 border-b bg-white">

      {/* Left */}
      <div className="flex items-center">
        <button className="text-gray-600 hover:text-black">
          ☰
        </button>
      </div>

      {/* Center */}
      <CommandSearch />

      {/* Right */}
      <div className="flex items-center gap-4">
        <button className="p-2 rounded-md hover:bg-gray-100">
          <Bell className="w-5 h-5 text-gray-600" />
        </button>

        <div className="w-8 h-8 rounded-full bg-gray-300" />
      </div>

    </header>
  );
}