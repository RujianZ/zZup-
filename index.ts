import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import App from './App';

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    html, body, #root, #root > div {
      height: 100% !important;
      width: 100% !important;
      display: flex !important;
      flex-direction: column !important;
      margin: 0 !important;
      padding: 0 !important;
      background-color: #FFFFFF !important;
    }
  `;
  document.head.appendChild(style);
}

registerRootComponent(App);
