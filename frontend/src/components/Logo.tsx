// Logo component - stylized pie chart like in the mockup
export function Logo({ size = "large" }: { size?: "small" | "medium" | "large" }) {
  const sizeClasses = {
    small: "w-8 h-8",
    medium: "w-10 h-10",
    large: "w-16 h-16",
  };
  
  return (
    <svg className={sizeClasses[size]} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="32" r="28" fill="#C5D9F1" />
      <path 
        d="M32 4C17.088 4 4 17.088 4 32s13.088 28 28 28V32L32 4z" 
        fill="#A5B9D6" 
      />
      <path 
        d="M32 32V4c15.464 0 28 12.536 28 28H32z" 
        fill="#F9D7A0" 
      />
    </svg>
  );
}
