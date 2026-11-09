package com.mushafi.app;

import android.app.Activity;
import android.hardware.*;
import android.os.*;
import android.view.Surface;
import android.webkit.WebView;
import org.json.JSONObject;

/** Foreground-only magnetic compass, corrected to true north and display rotation. */
public final class QiblaController implements SensorEventListener {
 private final Activity activity;private final WebView web;private final SensorManager manager;private final Handler main=new Handler(Looper.getMainLooper());
 private boolean requested,running,vector,haveGravity,haveMagnetic;private float declination;private int accuracy=-1;private long lastUpdate;
 private final float[] gravity=new float[3],magnetic=new float[3],rotation=new float[9];
 public QiblaController(Activity activity,WebView web){this.activity=activity;this.web=web;manager=(SensorManager)activity.getSystemService(Activity.SENSOR_SERVICE);}
 public void start(double lat,double lon){if(Double.isNaN(lat)||Double.isInfinite(lat)||Double.isNaN(lon)||Double.isInfinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return;declination=new GeomagneticField((float)lat,(float)lon,0,System.currentTimeMillis()).getDeclination();requested=true;resume();}
 public void resume(){if(!requested||running)return;accuracy=-1;lastUpdate=0;haveGravity=false;haveMagnetic=false;if(manager==null){unavailable();return;}Sensor sensor=manager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);if(sensor==null)sensor=manager.getDefaultSensor(Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR);vector=sensor!=null;boolean registered;if(vector)registered=manager.registerListener(this,sensor,SensorManager.SENSOR_DELAY_UI,main);else{Sensor accelerometer=manager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER),magnetometer=manager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD);registered=accelerometer!=null&&magnetometer!=null&&manager.registerListener(this,accelerometer,SensorManager.SENSOR_DELAY_UI,main)&&manager.registerListener(this,magnetometer,SensorManager.SENSOR_DELAY_UI,main);}if(!registered){manager.unregisterListener(this);unavailable();return;}running=true;emit(newMessage().put("available",true).put("waiting",true));}
 public void pause(){running=false;if(manager!=null)manager.unregisterListener(this);}
 public void stop(){requested=false;pause();}

 public static double trueHeading(float[] rotation,int displayRotation,float declination){float[] displayMatrix=new float[9],orientation=new float[3];int x=SensorManager.AXIS_X,y=SensorManager.AXIS_Y;switch(displayRotation){case Surface.ROTATION_90:x=SensorManager.AXIS_Y;y=SensorManager.AXIS_MINUS_X;break;case Surface.ROTATION_180:x=SensorManager.AXIS_MINUS_X;y=SensorManager.AXIS_MINUS_Y;break;case Surface.ROTATION_270:x=SensorManager.AXIS_MINUS_Y;y=SensorManager.AXIS_X;break;}SensorManager.remapCoordinateSystem(rotation,x,y,displayMatrix);SensorManager.getOrientation(displayMatrix,orientation);return (Math.toDegrees(orientation[0])+declination+360)%360;}
 private void unavailable(){running=false;emit(newMessage().put("available",false).put("error","لا يتوفر حساس بوصلة على هذا الجهاز. يمكنك قراءة اتجاه القبلة من الشمال."));}
 private static final class Message extends JSONObject {public Message put(String key,boolean value){try{super.put(key,value);}catch(Exception ignored){}return this;}public Message put(String key,Object value){try{super.put(key,value);}catch(Exception ignored){}return this;}}
 private Message newMessage(){return new Message();}
 private void emit(JSONObject value){web.evaluateJavascript("window.onNativeQibla&&window.onNativeQibla("+value.toString()+")",null);}
 @Override public void onAccuracyChanged(Sensor sensor,int value){if(vector||sensor.getType()==Sensor.TYPE_MAGNETIC_FIELD)accuracy=value;}
 @Override public void onSensorChanged(SensorEvent event){if(!running)return;try{if(vector){SensorManager.getRotationMatrixFromVector(rotation,event.values);accuracy=event.accuracy;}else{boolean isGravity=event.sensor.getType()==Sensor.TYPE_ACCELEROMETER;float[] target=isGravity?gravity:magnetic;boolean initialized=isGravity?haveGravity:haveMagnetic;for(int i=0;i<3;i++)target[i]=initialized?target[i]+.18f*(event.values[i]-target[i]):event.values[i];if(isGravity)haveGravity=true;else{haveMagnetic=true;accuracy=event.accuracy;}if(!haveGravity||!haveMagnetic||!SensorManager.getRotationMatrix(rotation,null,gravity,magnetic))return;}long now=SystemClock.elapsedRealtime();if(now-lastUpdate<90)return;lastUpdate=now;double heading=trueHeading(rotation,activity.getWindowManager().getDefaultDisplay().getRotation(),declination);JSONObject result=new JSONObject().put("available",true).put("heading",heading).put("accuracy",accuracy);emit(result);}catch(Exception ignored){}}
}
