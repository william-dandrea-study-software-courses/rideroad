import { Component, OnInit } from '@angular/core';
import {GeolocalisationService} from "../../core/service/geolocalisation.service";
import {MatDialog} from "@angular/material/dialog";
import {DialogPopupOverComponent} from "../../shared/components/dialog-popup-over/dialog-popup-over.component";

@Component({
  selector: 'app-gps',
  templateUrl: './gps.component.html',
  styleUrls: ['./gps.component.scss']
})
export class GpsComponent implements OnInit {

  public positionAllowed: boolean = false

  constructor(private geolocalisationService: GeolocalisationService, public dialog: MatDialog) {

  }

  ngOnInit(): void {
    this.geolocalisationService.getLocalisation((position: GeolocationPosition) => {
      console.log(position)
      this.positionAllowed = true
      this.dialog.closeAll()
    }, () => {
      this.positionAllowed = false
      this.dialog.open(DialogPopupOverComponent, {
        width: '250px',
        disableClose: true,
      })
    })


  }

}