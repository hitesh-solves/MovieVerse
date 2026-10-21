package com.example.demo;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HelloController {
    @GetMapping("hello")
    public String hello(){
        return "helllo from MovieVerse";
    }
    @GetMapping("about")
    public String about() {
        return "MovieVerse helps you discover movies!";
    }

}
