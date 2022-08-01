import {AfterViewInit, ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit} from '@angular/core';

import * as L from 'leaflet';
import {Map, LatLng, Marker, Layer, LatLngBounds, Content} from "leaflet";
import {ItineraryService} from "../../core/service/itinerary.service";
import {PathModel} from "../../core/model/itinerary.model";
import {merge, Observable, startWith, Subscription} from "rxjs";
import { map } from 'rxjs/operators';
import {MatSnackBar} from "@angular/material/snack-bar";
import {MapClickService} from "../../core/service/map-click.service";
import {ItineraryVisual} from "../../core/model/itinerary-visual.class";
import {GeolocalisationService} from "../../core/service/geolocalisation.service";
import {MatDialog} from "@angular/material/dialog";
import {SpinnerComponent} from "../../shared/components/spinner/spinner.component";
import {BreakpointObserver, Breakpoints, MediaMatcher} from "@angular/cdk/layout";
import { environment } from 'src/environments/environment';
import {AmenityService} from "../../core/service/amenity.service";

@Component({
  selector: 'app-itinerary',
  templateUrl: './itinerary.component.html',
  styleUrls: ['./itinerary.component.scss']
})
export class ItineraryComponent implements OnInit, AfterViewInit, OnDestroy {

  public getScreenWidth: any;
  public getScreenHeight: any;


  // @ts-ignore
  public map: Map;

  private currentDrewLayersItinerary: Layer[] = [];

  private itinerarySubscription: Subscription = new Subscription();
  private selectedItinerarySubscription: Subscription = new Subscription();
  private startMarkerSubscription: Subscription = new Subscription();
  private endMarkerSubscription: Subscription = new Subscription();
  private checkPointsMarkersSubscription: Subscription = new Subscription();

  private startMarker: Marker | null = null;
  private endMarker: Marker | null = null;
  private checkPointsMarkers: Marker[] | null = null;

  private isLoadingNewItinerarySubscription: Subscription = new Subscription();
  public isLoadingNewItinerary: boolean = false;

  constructor(
    private itineraryService: ItineraryService,
    private mapClickService: MapClickService,
    private amenityService: AmenityService,
    private snackBar: MatSnackBar,
    private geolocalisationService: GeolocalisationService,
    public dialog: MatDialog,
    private breakpointObserver: BreakpointObserver,

  ){}

  public ngOnInit(): void {
    this.itineraryManager();
    this.setMarkersStartStop();
    this.setOverlayIfLoadingNewItinerary();
    this.setCheckPointsSubscription();
    this.setAmenities();

    this.getScreenWidth = window.innerWidth;
    this.getScreenHeight = window.innerHeight;


  }

  public ngAfterViewInit(): void {
    this.initialisationMap();
  }


  private amenititiesLayers: Layer[] = [];

  private setAmenities() {
    this.amenityService.$amenitiesResult.subscribe(amenitiesResult => {
      this.amenititiesLayers.forEach(ame => this.map.removeLayer(ame))
      this.amenititiesLayers = [];

      amenitiesResult.forEach(amenity => {
        const layer = L.marker(new LatLng(amenity.lat, amenity.lon), {
          icon: L.icon({
            iconUrl: this.amenityService.getIconUrl(amenity.tags.amenity),
            iconSize: [35, 35]
          }),
        })

        const popup = L.popup({
          autoClose: false,
        }).setContent(JSON.stringify(amenity.tags))

        layer.bindPopup(popup, {
          closeButton: false
        })

        this.map.addLayer(layer)
        this.amenititiesLayers.push(layer)
      });
    })
  }



  /**
   * This method initialize the map with OpenStreetMap and LeafLet. At first, we center the map on our current position
   * (or in Paris if the user don't allow the geo-localisation). And secondly, we call the tileServer (OSM) with LeafLet
   * and we had this tiles to the map (tiles are squares PNG where you can see the map)
   */
  private initialisationMap(): void {
    this.map = L.map('map', {
      center: [ 43.482957, -1.762642 ],
      zoom: 14,
    });

    const tiles = L.tileLayer('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', {
      maxZoom: 18,
      minZoom: 8,
      attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      detectRetina: true,
    });

    tiles.addTo(this.map);

    this.centerOnUserPosition();
    this.setClickOnMap();
    this.getMapBounds();
    this.addLegend()

  }

  private addLegend() {
    const legend = new (L.Control.extend({
      options: { position: 'bottomright'}
    }));

    const vm = this;
    legend.onAdd = function (map) {

      const div = L.DomUtil.create('div', 'legend' );

      const labels = [
        {name: 'Dirt Road', color: "#8f5858"},
        {name: 'Bike Road', color: "#759bc9"},
        {name: 'Regular Road', color: "#484848"},
        {name: 'Pedestrian Road', color: "#4f7c40"},
      ];


      div.innerHTML = '<div style="background-color: white"><b>Legend</b></div>';
      for (let i = 0; i < labels.length; i++) {
        div.innerHTML += `<i style="background-color: ${labels[i].color}; height: 10px; width: 10px;>"> &nbsp; &nbsp; </i>` + '  ' +  labels[i].name + '<br/>';
      }

      div.style.backgroundColor = "#FFF"
      div.style.padding = "20px"

      return div;
    };

    legend.addTo(this.map);
  }

  private getMapBounds() {
    this.map.on('moveend', (v) => {
      console.log(this.map.getZoom())
      if (this.map.getZoom() >= 14) {
        this.amenityService.changeMapBounds(this.map.getBounds())
      }
    })
  }

  /**
   * Method used for initiate the center on the map on the user location, but the user need to allow localisation
   */
  private centerOnUserPosition() {
    this.geolocalisationService.getLocalisation((position: GeolocationPosition) => {
      this.map.setView(new LatLng(position.coords.latitude, position.coords.longitude));
    }, () => {
      this.snackBar.open("You didn't allow your localisation", '', {duration: 2000,})
    })
  }

  /**
   * Initiate the click on the map, for each click on the map, the clickService will be called and be used in  the
   * other components
   * @private
   */
  private setClickOnMap() {
    this.map.on('click', (v) => {
      this.mapClickService.setClickPosition(v);
    })
  }


  /**
   * This method launch the subscriptions to the itineraryService and selectedItineraryService, and call the methodds for
   * displaying them on the map
   */
  private itineraryManager(): void {
    this.itinerarySubscription = this.itineraryService.$itineraryVisual.subscribe(itinerariesVisual => {
      console.log(itinerariesVisual)

      if (itinerariesVisual != null && itinerariesVisual.length > 0){
        // We set the start point
        this.setItineraryMapView(itinerariesVisual[0]);

        // Now, we get the selected itinerary
        this.generateItineraryPathForMap(itinerariesVisual)

        // this.generateRectangleBbox(itinerariesVisual)
      }
    }, error => {
      this.itineraryNotFindError(error)
    })
  }

  private generateRectangleBbox(itinerariesVisual: ItineraryVisual[]) {

    itinerariesVisual[0].itinerary.paths.forEach(path => {
      L.circleMarker(new LatLng(path.coords[0].lat, path.coords[0].lon)).addTo(this.map)
    })


  }

  /**
   * This method show the itineraries, 'underline' the selected itinerary and show the not selected ones in grey
   * @param itinerariesVisual
   */
  private generateItineraryPathForMap(itinerariesVisual: ItineraryVisual[]): void {

    // We remove the old itineraries from the map
    this.currentDrewLayersItinerary.forEach(currentItineraryLayer => {
      this.map.removeLayer(currentItineraryLayer)
    });
    this.currentDrewLayersItinerary = [];

    let indexSelectedItinerary = 0;
    // We generate the paths as layers for the map and add them to the currentItineraryLayers array
    for (let index = 0; index < itinerariesVisual.length; index++) {
      const allPaths: PathModel[] = itinerariesVisual[index].itinerary.paths;
      let allSegments = []

      const opacity: number = itinerariesVisual[index].is_selectionned ? 1.0 : 1.0
      indexSelectedItinerary = itinerariesVisual[index].is_selectionned ? index : indexSelectedItinerary;

      for (let path of allPaths) {
        if (path.coords != null) {
          const allLongLat = path.coords.map(coord => new LatLng(coord.lat, coord.lon, coord.elevation))

          let color: string = "#b2b2b2"

          if (itinerariesVisual[index].is_selectionned) {

            if (this.itineraryService.isDirtPath(path.tags['highway'])) {
              color = "#8f5858"
            } else if (this.itineraryService.isPedestrianPath(path.tags['highway'])) {
              color = "#4f7c40"
            } else if (this.itineraryService.isBikePath(path.tags['highway'])) {
              color = "#759bc9"
            } else {
              color = "#484848"
            }
          }


          const currentSegment =  L.polyline(allLongLat, {
            color: color,
            weight: 7,
            smoothFactor: 1,
            opacity: opacity,
          })

          allSegments.push(currentSegment)
        }

      }

      itinerariesVisual[index].segments_on_map = L.featureGroup(allSegments);
    }

    this.showItineraryOnMap(itinerariesVisual);
  }

  /**
   * This method show the apth on the map, and we put the selected itinerary at the top of all this path (for more
   * visibility)
   * @param itinerariesVisual : list of itinerary that we want to show on the map
   */
  private showItineraryOnMap(itinerariesVisual: ItineraryVisual[]): void {
    // We add the new itineraries to the map
    // First we add the not-seleted itineraries
    itinerariesVisual.forEach(currentItineraryVisual => {
      if (currentItineraryVisual.segments_on_map != null) {
        if (!currentItineraryVisual.is_selectionned) {
          currentItineraryVisual.segments_on_map.addTo(this.map);
          this.currentDrewLayersItinerary.push(currentItineraryVisual.segments_on_map)
          currentItineraryVisual.segments_on_map.on('click', (e) => {
            this.itineraryService.changeSelectedItinerary(currentItineraryVisual.index)
          });
        }
      }
    })

    // And we add the selected itinerary
    itinerariesVisual.forEach(currentItineraryVisual => {
      if (currentItineraryVisual.segments_on_map != null) {
        if (currentItineraryVisual.is_selectionned) {
          currentItineraryVisual.segments_on_map.addTo(this.map);
          this.currentDrewLayersItinerary.push(currentItineraryVisual.segments_on_map)
          currentItineraryVisual.segments_on_map.on('click', (e) => {
            this.itineraryService.changeSelectedItinerary(currentItineraryVisual.index)
          });
        }
      }
    })
  }


  /**
   * Handled when the backend return an error
   */
  private itineraryNotFindError(error: any): void {
    this.snackBar.open('Cannot find the path', 'OK', {
      duration: 5,
    });
  }


  /**
   * Method who set the marker on the map when the new itinerary is generated. When the new itinerary is generated, we delete
   * every others markers on the map, and we add this markers. We delete all the other markers for being sure that we
   * don't have several times the same marker
   */
  private setItineraryMapView(itineraryVisual: ItineraryVisual) {

    if (this.startMarker != null) {
      this.startMarker.remove();
      this.startMarker = null;
    }

    if (this.endMarker != null) {
      this.endMarker.remove();
      this.endMarker = null;
    }

    if (itineraryVisual.startLatLng && itineraryVisual.endLatLng) {
      const startLatLng = itineraryVisual.startLatLng;
      const endLatLng = itineraryVisual.endLatLng;
      this.map.fitBounds(L.latLngBounds(startLatLng, endLatLng));

      this.startMarker = L.marker(startLatLng, {
        icon: L.icon({
          iconUrl: '/assets/icons/start_marker.png',
          iconSize: [35, 35]
        }),
      })
      this.startMarker.addTo(this.map)

      this.endMarker = L.marker(endLatLng, {
        icon: L.icon({
          iconUrl: '/assets/icons/start_marker.png',
          iconSize: [35, 35]
        }),
      })
      this.endMarker.addTo(this.map)
    }
  }


  /**
   * Method who show the marker at the departure / destination position when a user select a new departure (via the input
   * field or the cursor selector). The inputUserStartMarker and inputUserEndMarker need to be clean (removed from the map)
   * when the user change / remove the destination from the input / cursor
   */
  private setMarkersStartStop() {
    this.startMarkerSubscription = this.itineraryService.$startMarker.subscribe(value => {

      if (this.startMarker != null) {
        this.startMarker.remove();
        this.startMarker = null;
      }

      if (value != null) {
        this.startMarker = L.marker(value, {
          icon: L.icon({
            iconUrl: '/assets/icons/start_marker.png',
            iconSize: [35, 35]
          }),
        })

        this.startMarker.addTo(this.map);
        this.map.setView(value);
      }

    })

    this.endMarkerSubscription = this.itineraryService.$endMarker.subscribe(value => {
      if (this.endMarker != null) {
        this.endMarker.remove()
        this.endMarker = null;
      }

      if (value != null) {
        this.endMarker = L.marker(value, {
          icon: L.icon({
            iconUrl: '/assets/icons/start_marker.png',
            iconSize: [35, 35]
          }),
        })
        this.map.addLayer(this.endMarker)
        this.map.setView(value);
      }
    })
  }

  public setOverlayIfLoadingNewItinerary(): void {
    this.isLoadingNewItinerarySubscription = this.itineraryService.$isLoadingItineraryOnBackend.subscribe(isLoading => {
      this.isLoadingNewItinerary = isLoading;

      if (isLoading) {
        this.dialog.open(SpinnerComponent);
      }

      if (!isLoading) {
        this.dialog.closeAll();
      }

    })
  }

  private setCheckPointsSubscription() {
    this.checkPointsMarkersSubscription = this.itineraryService.$checkPoints.subscribe(newCheckPoints => {

      if (this.checkPointsMarkers != null) {
        this.checkPointsMarkers.forEach(checkPointMarker => checkPointMarker.remove())
      }

      this.checkPointsMarkers = []

      if (newCheckPoints != null) {

        newCheckPoints.forEach(newCheckPoint => {
          const newMarker = L.marker(newCheckPoint, {
            icon: L.icon({
              iconUrl: '/assets/icons/start_marker.png',
              iconSize: [35, 35]
            }),
          })
          this.map.addLayer(newMarker)

          // @ts-ignore
          this.checkPointsMarkers.push(newMarker)

        })
      }

    })
  }


  @HostListener('window:resize', ['$event'])
  onWindowResize() {
    this.getScreenWidth = window.innerWidth;
    this.getScreenHeight = window.innerHeight;
    this.map.off();
    this.map.remove();
    this.initialisationMap()
  }

  public ngOnDestroy() {
    this.itinerarySubscription.unsubscribe();
    this.selectedItinerarySubscription.unsubscribe();
    this.startMarkerSubscription.unsubscribe();
    this.endMarkerSubscription.unsubscribe();
    this.isLoadingNewItinerarySubscription.unsubscribe();
    this.checkPointsMarkersSubscription.unsubscribe();
  }
}

